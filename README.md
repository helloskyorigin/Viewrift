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

- A scan runs one Chromium browser and isolated contexts sequentially for the five sizes.
- Screenshots are returned as JPEG data URLs during the stream and are not stored server-side.
- Scans are limited per process and per forwarded IP as a basic prototype control.
- Failed viewports show a separate error status, not a fabricated pass.
- A retest compares whether the same issue type/selector is still detected; it does not guarantee the patch is correct.

## Project status

Source package prepared for a hackathon MVP. Dependencies/browser installation and a deployed, live end-to-end scan still need verification in an internet-connected Node environment.
