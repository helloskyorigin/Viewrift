import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["playwright", "playwright-core"],
  output: "standalone",
};
export default nextConfig;
