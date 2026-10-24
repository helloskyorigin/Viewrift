import { assertPublicTarget } from "@/lib/safety";
import { improveFixWithGroq } from "@/lib/ai";
import { launchScanner, scanDevice } from "@/lib/scanner";
import { DEVICES, type StreamEvent } from "@/lib/types";
import type { Browser } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Lightweight guards for a hackathon prototype. These are per-process, not
// distributed; production needs a shared rate limiter and strong network egress rules.
const hits = new Map<string, number[]>();
let active = 0;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
  const params = body as Record<string, unknown>;
  if (typeof params.url !== "string") return Response.json({ error: "Enter a website URL." }, { status: 400 });
  if (params.patch !== undefined && (typeof params.patch !== "string" || params.patch.length > 3000)) {
    return Response.json({ error: "The CSS patch is too large." }, { status: 400 });
  }
  const desired = params.deviceIds;
  if (desired !== undefined && (!Array.isArray(desired) || !desired.length || desired.length > 5 || desired.some(x => typeof x !== "string" || !DEVICES.some(d => d.id === x)))) {
    return Response.json({ error: "Invalid device selection." }, { status: 400 });
  }
  const selected = desired ? DEVICES.filter(d => desired.includes(d.id)) : DEVICES;
  let url: string;
  try { url = await assertPublicTarget(params.url); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Invalid URL." }, { status: 400 }); }

  const remoteIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(remoteIp) || []).filter(ts => now - ts < 60 * 60 * 1000);
  if (recent.length >= 8) return Response.json({ error: "Hourly scan limit reached. Try again later." }, { status: 429 });
  if (active >= 2) return Response.json({ error: "Scanner is busy. Please retry shortly." }, { status: 429 });
  hits.set(remoteIp, [...recent, now]);
  active++;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let browser: Browser | undefined;
      try {
        send({ type: "start", url });
        browser = await launchScanner();
        let aiBudget = 2;
        for (const device of selected) {
          if (request.signal.aborted) break;
          send({ type: "device_start", deviceId: device.id });
          const result = await scanDevice(browser, url, device, params.patch as string | undefined);
          if (result.status === "issues" && aiBudget > 0 && process.env.GROQ_API_KEY) {
            result.issues[0] = await improveFixWithGroq(result.issues[0], device.width);
            aiBudget--;
          }
          send({ type: "device_result", result });
        }
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message.slice(0, 180) : "Scan failed unexpectedly." });
      } finally {
        if (browser) await browser.close().catch(() => {});
        active = Math.max(0, active - 1);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
