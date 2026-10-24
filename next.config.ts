import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // Include compressed serverless browser payload in the API function trace.
  // Next.js 16 / Playwright >=1.60: browsers.json is loaded via a computed
  // require() and can be omitted from automatic file tracing. Without it,
  // importing playwright-core fails at *runtime* even though build succeeds.
  outputFileTracingIncludes: {
    "/api/scan": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./node_modules/@sparticuz/chromium/build/**/*",
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/playwright-core/lib/**/*",
    ],
  },
  output: "standalone",
  async headers() { return [{source:"/:path*",headers:[
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  ]}]; },
};
export default nextConfig;
