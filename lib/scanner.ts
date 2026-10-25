import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { assertPublicTarget } from "./safety";
import { issueFix } from "./fixes";
import type { Device, DeviceResult, DeviceDiagnostics, Issue } from "./types";

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
type ScanInspection = { findings: RawFinding[]; diagnostics: DeviceDiagnostics };

async function inspect(page: Page): Promise<ScanInspection> {
  return page.evaluate(() => {
    type Finding = { type: "horizontal-overflow" | "element-overflow" | "overlap" | "broken-image"; selector: string; title: string; description: string; rect: { x: number; y: number; width: number; height: number } | null };
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
    const brokenImages = Array.from(document.images).filter(image => image.complete && image.naturalWidth === 0 && (image.currentSrc || image.src));
    for (const image of brokenImages.slice(0, 2)) {
      const r = image.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      findings.push({
        type: "broken-image", selector: selectorFor(image), title: "Image failed to load",
        description: "A page image finished loading but has no image data. Verify its source URL, access permissions, and network response.",
        rect: rectOf(r),
      });
    }
    return {
      findings: findings.sort((a, b) => Number(b.type === "horizontal-overflow") - Number(a.type === "horizontal-overflow")).slice(0, 10),
      diagnostics: {
        title: document.title.slice(0, 160),
        documentWidth: pageWidth,
        overflowPixels: Math.max(0, pageWidth - W),
        elementsInspected: elements.length,
        interactiveElements: document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea').length,
        imagesFound: document.images.length,
        imagesBroken: brokenImages.length,
      },
    };
  });
}

/** Scan a family of viewports in one isolated browser context.
 * Mobile and desktop pages are separate because Chromium's isMobile setting
 * cannot be switched after context creation. Viewport dimensions are tested
 * independently, but the document is loaded only once per family. */
export async function scanDeviceGroup(
  browser: Browser,
  inputUrl: string,
  devices: readonly Device[],
  patch?: string,
  emit?: (result: DeviceResult) => void,
): Promise<DeviceResult[]> {
  if (devices.length === 0) return [];
  if (devices.some(d => (d.family === "mobile") !== (devices[0].family === "mobile"))) {
    throw new Error("A viewport group cannot mix mobile and desktop emulation.");
  }
  const results: DeviceResult[] = [];
  const groupStarted = Date.now();
  const push = (result: DeviceResult) => { results.push(result); emit?.(result); };
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
    viewport: { width: devices[0].width, height: devices[0].height },
    deviceScaleFactor: 1,
    isMobile: devices[0].family === "mobile",
    hasTouch: devices[0].family === "mobile",
    ignoreHTTPSErrors: false,
    serviceWorkers: "block",
    acceptDownloads: false,
    javaScriptEnabled: true,
    reducedMotion: "reduce",
    permissions: [],
    });

    // This includes launch failures: all group members receive an explicit
    // error instead of leaving the UI stuck at 2/5 indefinitely.
    let page: Page | undefined;
    let navigationError: string | undefined;
    let statusCode = 200;
    // Validate the origin of every browser request. Cache DNS checks by origin
    // within the isolated session, but do not accept unchecked redirects.
    const verifiedHosts = new Map<string, Promise<string>>();
    await context.route("**/*", async route => {
      try {
        const target = route.request().url();
        if (!/^https?:/i.test(target)) { await route.abort(); return; }
        const resourceType = route.request().resourceType();
        if (resourceType === "media" || resourceType === "eventsource") { await route.abort(); return; }
        const origin = new URL(target).origin;
        let check = verifiedHosts.get(origin);
        if (!check) { check = assertPublicTarget(target); verifiedHosts.set(origin, check); }
        await check;
        await route.continue();
      } catch { await route.abort().catch(() => {}); }
    });
    await context.routeWebSocket(/.*/, ws => ws.close());
    page = await context.newPage();
    page.on("dialog", dialog => { void dialog.dismiss().catch(() => {}); });
    page.on("popup", popup => { void popup.close().catch(() => {}); });
    try {
      const response = await page.goto(inputUrl, { waitUntil: "domcontentloaded", timeout: SCAN_TIMEOUT });
      statusCode = response?.status() ?? 200;
      await assertPublicTarget(page.url());
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Some SPAs have loaded usable content before slow analytics prevent
      // domcontentloaded. Do not discard their screenshot on a navigation timeout.
      const usable = /timeout/i.test(msg) && await page.evaluate(() =>
        Boolean(document.body && (document.body.children.length > 0 || document.body.innerText.length > 30))
      ).catch(() => false);
      if (!usable) navigationError = /timeout/i.test(msg)
        ? "The website did not load in time. Try again or check site availability."
        : "The browser could not open this public URL. It may block automated browsers.";
      else await assertPublicTarget(page.url());
    }
    if (!navigationError) {
      await page.waitForLoadState("load", { timeout: 1300 }).catch(() => {});
      if (patch) {
        await page.addStyleTag({ content: patch });
        await page.waitForTimeout(90);
      }
    }
    for (const device of devices) {
      const started = Date.now();
      if (navigationError) {
        push({ device, status: "error", issues: [], screenshot: null, error: navigationError, loadMs: Date.now() - groupStarted });
        continue;
      }
      let screenshot: string | null = null;
      try {
        await page.setViewportSize({ width: device.width, height: device.height });
        // A resize event is dispatched by Playwright; let responsive JavaScript
        // and layout settle without re-navigating to the same website.
        await page.waitForTimeout(190);
        const image = await page.screenshot({
          type: "jpeg", quality: 58, animations: "disabled",
          timeout: 4500, fullPage: false,
        });
        screenshot = `data:image/jpeg;base64,${image.toString("base64")}`;
        const { findings, diagnostics } = await inspect(page);
        const issues: Issue[] = findings.map((finding, i) => ({
          id: `${device.id}-${i}`, ...finding,
          severity: finding.type === "overlap" || finding.type === "broken-image" ? "medium" : "high",
          ...issueFix(finding.type, finding.selector, device.width),
        }));
        const httpError = statusCode >= 400;
        push({
          device,
          status: httpError ? "error" : issues.length ? "issues" : "pass",
          issues: httpError ? [] : issues,
          screenshot,
          diagnostics,
          error: httpError ? `The scanned website returned HTTP ${statusCode}. This is a real screenshot of the error response, not a passing layout.` : undefined,
          finalUrl: page.url(),
          loadMs: Date.now() - groupStarted,
        });
      } catch (error) {
        console.error("[Viewrift] Viewport failed:", device.id, error);
        push({
          device, status: "error", issues: [], screenshot,
          error: screenshot
            ? "Screenshot captured, but analysis failed. The viewport was not marked as passed."
            : "The browser could not capture this viewport. It may have timed out or crashed.",
          loadMs: Date.now() - started,
        });
      }
    }
  } catch (error) {
    console.error("[Viewrift] Browser group failed:", error);
    for (const device of devices.filter(d => !results.some(r => r.device.id === d.id))) {
      push({
        device, status: "error", issues: [], screenshot: null,
        error: "The browser failed while loading this group. Check scanner runtime and retry.",
        loadMs: Date.now() - groupStarted,
      });
    }
  } finally {
    await context?.close().catch(() => {});
  }
  return results;
}

/** Single-device retest retains the same security, screenshot and analysis path. */
export async function scanDevice(
  browser: Browser, inputUrl: string, device: Device, patch?: string
): Promise<DeviceResult> {
  const result = await scanDeviceGroup(browser, inputUrl, [device], patch);
  return result[0];
}
