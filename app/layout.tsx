import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Viewrift — Your website. Every screen. No surprises.",
  description: "Test your website across five screen sizes. Reveal responsive layout issues with screenshots, suggested fixes, and honest retest results.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
