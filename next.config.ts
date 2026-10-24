import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // Include compressed serverless browser payload in the API function trace.
  outputFileTracingIncludes: { "/api/scan": ["./node_modules/@sparticuz/chromium/bin/**"] },
  output: "standalone",
  async headers() { return [{source:"/:path*",headers:[
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  ]}]; },
};
export default nextConfig;
