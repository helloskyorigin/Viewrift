# Viewrift

**Your website. Every screen. No surprises.**

Viewrift is a responsive-layout testing website for developers and creators, built for a short hackathon sprint. Users paste a public URL; the app opens it in real Chromium browser contexts at five viewport sizes, streams progress, returns screenshots and measured layout findings, suggests reviewable CSS, and allows a temporary CSS retest.

## Five preset viewports

| Label | CSS viewport |
| --- | --- |
| Android | 360 × 800 |
| iPhone | 390 × 844 |
| Tablet | 768 × 1024 |
| Laptop | 1366 × 768 |
| Desktop | 1920 × 1080 |

## Three-screen UX

1. Landing: paste URL or explore **clearly labeled sample report**.
2. Scanning: streams *actual* per-device progress from the server.
3. Results: screenshot, findings, CSS suggestions, temporary patch retest.

No login, dashboard, subscription, or payment.

## Local setup

Requires **Node.js 22+**. Install packages and Chromium:

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Localhost and private-IP scans are intentionally rejected. Test against a publicly accessible website, or click **Explore a sample report** for a labeled UI-only example. An optional `GROQ_API_KEY` enables AI rewrite suggestions on up to two detected issues per scan; deterministic CSS suggestions work with no key.

## Deploy on Google Cloud Run

Playwright needs a Chrome/Chromium executable. **Do not deploy this as a static site** or to a runtime without the browser dependencies. The repo includes a Dockerfile using an official Playwright browser image with exactly matching Playwright npm version.

```bash
gcloud run deploy viewrift --source . --region asia-south1 --allow-unauthenticated --memory 2Gi --cpu 2 --timeout 180
```

The command above is a *starting point*, not an endorsement for immediate public deployment. Before exposing arbitrary URL scanning, configure network egress restrictions / proxy isolation, real distributed rate limiting, scan budgets, security review, and logs/monitoring. Chrome viewing untrusted pages has security and abuse risks. For a demo, restrict access to known testers/URLs until these are addressed.

For optional Groq support, add `GROQ_API_KEY` securely through Secret Manager, **never** commit credentials.

## What tests actually cover

- Viewport-specific screenshots captured by Playwright Chromium
- Document horizontal overflow
- Elements that render beyond the horizontal viewport
- *Possible* substantial intersections between interactive elements
- Suggested CSS (rule-based fallback; optional Groq generation)
- Temporary CSS injection followed by real re-scan of the selected viewport

### Honest limitations

This is **not** a complete visual regression or accessibility audit. Measurements can have false positives/negatives; modal overlays and intentional sticky components may overlap. Device presets do **not** reproduce Safari or specific real phones. Some pages block automation, demand authentication, or have dynamically changing content. URL-based tests cannot inspect source stylesheets or commit fixes to the target repository. `Apply temporarily & retest` only changes the isolated browser session.

### Important security note

`lib/safety.ts` performs best-effort URL validation, DNS checks, and blocks private/special-purpose addresses; intercepted requests and redirects are validated. **This does not fully prevent SSRF**, including DNS rebinding and browser-network edge cases. It is not a substitute for egress policy / sandboxing. The built-in in-memory rate limiter is a prototype, not distributed abuse protection. Do not present this project as production security hardened.

## Stack

Next.js App Router + React + TypeScript + CSS + Playwright Chromium + optional Groq. NDJSON streaming via `/api/scan`.

## Implementation notes

- A scan runs **one Chromium browser** with up to **two isolated viewport contexts in parallel**. Results stream as each viewport finishes; users can view a partial report while others run.
- Screenshots are returned as JPEG data URLs during the stream and are not stored server-side.
- Optional Groq suggestions run independently of the viewport scan and are bounded by a short timeout; rule-based CSS suggestions appear first.
- Scans are limited per process and per forwarded IP as a basic prototype control.
- Browser startup (including serverless cold starts), slow DNS, third-party scripts, and hosting constraints can still dominate latency. This is a faster MVP, not a guaranteed fixed-time scan.
- Failed viewports show a separate error status, not a fabricated pass.
- A retest compares whether the same issue type/selector is still detected; it does not guarantee the patch is correct.

## Project status

Source package prepared for a hackathon MVP. Dependencies/browser installation and a deployed, live end-to-end scan still need verification in an internet-connected Node environment.

## Release refinements (24 October 2026)

- Viewrift vector logo and matching browser favicon.
- Clear, lightweight three-screen UX; responsive report with safe sample labeling.
- Real scan events now stream as each viewport starts and completes.
- If a later viewport fails, already collected scan results are preserved.
- Per-viewport error states stay separate from passing checks.
- Downloadable JSON issue reports (screenshots excluded to keep exports lighter).
- Temporary CSS patch validation, safer errors, popup blocking, and issue re-check.
- Privacy and Terms pages with honest data handling information.
- /api/health endpoint and security response headers.
- GitHub Actions workflow includes security logic tests, TypeScript checks, Next.js build, mobile UI smoke, and live Chromium screenshot verification.

### Release gate before declaring fully production-ready

Check the **GitHub Actions** run in this repository. It must pass before claiming the shipped commit builds and scans successfully. Then deploy behind network-level SSRF protection, add distributed rate limiting and monitoring, and test real sites under expected traffic. CI can validate one Chromium scan but cannot certify all websites or device/browser combinations.
