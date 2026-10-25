import { chromium, type Browser, type Page } from "playwright-core";
import { assertPublicTarget } from "./safety";
import { issueFix } from "./fixes";
import type { Device, DeviceResult, Issue } from "./types";

const SCAN_TIMEOUT = 8500; // Per-navigation upper bound; never wait for networkidle on third-party sites.

export async function launchScanner(): Promise<Browser> {
  // Vercel functions do not ship Playwright's downloaded Chromium executable.
  // Sparticuz provides an AWS-Lambda-compatible Chromium archive for Node.js.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const { default: serverlessChromium } = await import("@sparticuz/chromium");
    // Single-threaded serverless environments often fail when the browser
    // consumes GPU memory; disable WebGL before starting Chromium.
    serverlessChromium.setGraphicsMode = false;
    const executablePath = await serverlessChromium.executablePath();
    if (!executablePath) throw new Error("Chromium binary was not available in the serverless function.");
    return chromium.launch({
      headless: true,
      args: serverlessChromium.args,
      executablePath,
      timeout: 25000,
    });
  }
  return chromium.launch({ headless: true, timeout: 12000 });
}

type RawFinding = { type: Issue["type"]; selector: string; title: string; description: string; rect: Issue["rect"] };

async function inspect(page: Page): Promise<RawFinding[]> {
  return page.evaluate(() => {
    type Finding = { type: "horizontal-overflow" | "element-overflow" | "overlap"; selector: string; title: string; description: string; rect: { x: number; y: number; width: number; height: number } | null };
    const W = window.innerWidth;
    const findings: Finding[] = [];
    const selectorFor = (el: Element): string => {
      if (el.id && /^[A-Za-z_][\w-]{0,70}$/.test(el.id)) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = Array.from(el.classList).filter(c => /^[A-Za-z_-][\w-]{0,30}$/.test(c)).slice(0, 2);
      if (cls.length) return `${tag}.${cls.join(".")}`;
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter(e => e.tagName === el.tagName);
      return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(el)+1})` : tag;
    };
    const rectOf = (r: DOMRect) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    if (pageWidth > W + 3) {
      findings.push({ type: "horizontal-overflow", selector: "body", title: "Horizontal page overflow", description: `Page scroll width is ${pageWidth}px on a ${W}px viewport.`, rect: { x: W - 16, y: 0, width: 16, height: Math.min(window.innerHeight, 200) } });
    }
    const elements = Array.from(document.body?.querySelectorAll("*") || []).slice(0, 2200);
    for (const el of elements) {
      if (findings.filter(f => f.type === "element-overflow").length >= 5) break;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.1) continue;
      if (style.position === "fixed" && style.transform !== "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 8 || r.bottom <= 0 || r.top >= window.innerHeight) continue;
      // True overflow: right or left side is outside the viewport, excluding tiny anti-aliasing differences.
      if (r.right > W + 4 || r.left < -4) {
        // Prefer concrete leaf-ish elements over giant ancestor containers.
        if (r.width > W * 2.5 && el.children.length > 3) continue;
        findings.push({ type: "element-overflow", selector: selectorFor(el), title: "Element exceeds viewport", description: `Element extends from x=${Math.round(r.left)} to ${Math.round(r.right)} on a ${W}px viewport.`, rect: rectOf(r) });
      }
    }
    const interactives = elements.filter(el => el.matches("button, a[href], input:not([type=hidden]), select, textarea"))
      .filter(el => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 16 && r.height > 16 && r.bottom > 0 && r.top < window.innerHeight && s.visibility !== "hidden" && s.display !== "none"; }).slice(0, 100);
    let overlapCount = 0;
    for (let i = 0; i < interactives.length && overlapCount < 2; i++) {
      for (let j = i + 1; j < interactives.length && overlapCount < 2; j++) {
        const a = interactives[i], b = interactives[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        const iw = Math.max(0, Math.min(ar.right, br.right) - Math.max(ar.left, br.left));
        const ih = Math.max(0, Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top));
        if (iw * ih > Math.min(ar.width * ar.height, br.width * br.height) * .35) {
          overlapCount++;
          findings.push({ type: "overlap", selector: selectorFor(a), title: "Possible interactive overlap", description: "Two interactive elements occupy substantially overlapping screen space. Review this screenshot; it may be intentional.", rect: rectOf(ar) });
        }
      }
    }
    return findings.sort((a, b) => Number(b.type === "horizontal-overflow") - Number(a.type === "horizontal-overflow")).slice(0, 8);
  });
}

export async function scanDevice(browser: Browser, inputUrl: string, device: Device, patch?: string): Promise<DeviceResult> {
  const started = Date.now();
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 1,
    isMobile: device.family === "mobile",
    hasTouch: device.family === "mobile",
    ignoreHTTPSErrors: false,
    serviceWorkers: "block",
    acceptDownloads: false,
    javaScriptEnabled: true,
    reducedMotion: "reduce",
    permissions: [],
  });
  let page: Page | undefined;
  try {
    const verifiedHosts = new Map<string, Promise<string>>();
    await context.route("**/*", async (route) => {
      try {
        const reqUrl = route.request().url();
        if (!/^https?:/i.test(reqUrl)) return await route.abort();
        const resourceType = route.request().resourceType();
        if (resourceType === "media" || resourceType === "eventsource") return await route.abort();
        const origin = new URL(reqUrl).origin;
        let verified = verifiedHosts.get(origin);
        if (!verified) {
          verified = assertPublicTarget(reqUrl);
          verifiedHosts.set(origin, verified);
        }
        await verified;
        await route.continue();
      } catch { try { await route.abort(); } catch {} }
    });
    // Do not allow sites being scanned to create persistent socket connections.
    await context.routeWebSocket(/.*/, ws => ws.close());
    page = await context.newPage();
    page.on("dialog", d => { void d.dismiss().catch(() => {}); });
    page.on("popup", popup => { void popup.close().catch(() => {}); });
    await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: SCAN_TIMEOUT });
    await assertPublicTarget(page.url());
    await page.waitForTimeout(180);
    if (patch) {
      await page.addStyleTag({ content: patch });
      await page.waitForTimeout(120);
    }
    const raw = await inspect(page);
    const issues: Issue[] = raw.map((finding, i) => {
      const fix = issueFix(finding.type, finding.selector, device.width);
      return { id: `${device.id}-${i}`, ...finding, severity: finding.type === "overlap" ? "medium" : "high", ...fix };
    });
    const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 48, animations: "disabled", timeout: 4000, fullPage: false });
    return {
      device,
      status: issues.length ? "issues" : "pass",
      issues,
      screenshot: `data:image/jpeg;base64,${screenshotBuffer.toString("base64")}`,
      finalUrl: page.url(),
      loadMs: Date.now() - started,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown scan failure";
    return {
      device,
      status: "error",
      issues: [],
      screenshot: null,
      error: /timeout/i.test(msg) ? "This page took too long to load." : /ERR_/i.test(msg) ? "The browser could not load this page. Check the URL or site restrictions." : "This viewport could not be tested. Check that it is public, then try again.",
      loadMs: Date.now() - started,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
