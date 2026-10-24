import { chromium, type Browser, type Page } from "playwright";
import { assertPublicTarget } from "./safety";
import { issueFix } from "./fixes";
import type { Device, DeviceResult, Issue } from "./types";

const SCAN_TIMEOUT = 17000;

export async function launchScanner(): Promise<Browser> {
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
    return findings.sort((a, b) => Number(a.type === "horizontal-overflow") - Number(b.type === "horizontal-overflow")).slice(0, 8);
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
  });
  let page: Page | undefined;
  try {
    await context.route("**/*", async (route) => {
      try {
        const reqUrl = route.request().url();
        if (!/^https?:/i.test(reqUrl)) return await route.abort();
        await assertPublicTarget(reqUrl);
        await route.continue();
      } catch { try { await route.abort(); } catch {} }
    });
    // Do not allow sites being scanned to create persistent socket connections.
    await context.routeWebSocket(/.*/, ws => ws.close());
    page = await context.newPage();
    page.on("dialog", d => { void d.dismiss().catch(() => {}); });
    await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: SCAN_TIMEOUT });
    await page.waitForTimeout(1100);
    if (patch) {
      await page.addStyleTag({ content: patch });
      await page.waitForTimeout(350);
    }
    const raw = await inspect(page);
    const issues: Issue[] = raw.map((finding, i) => {
      const fix = issueFix(finding.type, finding.selector, device.width);
      return { id: `${device.id}-${i}`, ...finding, severity: finding.type === "overlap" ? "medium" : "high", ...fix };
    });
    const screenshotBuffer = await page.screenshot({ type: "jpeg", quality: 55, animations: "disabled", timeout: 9000, fullPage: false });
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
      error: /timeout/i.test(msg) ? "This page took too long to load." : /ERR_/i.test(msg) ? "The browser could not load this page. Check the URL or site restrictions." : msg.slice(0, 180),
      loadMs: Date.now() - started,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
