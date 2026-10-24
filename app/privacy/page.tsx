import Link from "next/link";
export const metadata = { title: "Privacy | Viewrift" };
export default function Privacy(){
return <main className="legal-page"><Link href="/" className="legal-back">← Viewrift</Link><h1>Privacy &amp; data handling</h1>
<p className="legal-lede">Viewrift checks publicly reachable webpages in temporary browser sessions. Please do not submit private URLs or confidential content.</p>
<h2>What we process</h2><p>When you submit a public URL, Viewrift loads the page in Chromium, measures layout geometry and creates screenshots for your current report. Screenshots and findings are streamed back to your browser. This MVP does not store scan reports in a database.</p>
<h2>Operational data</h2><p>The application keeps a short-lived in-memory request count for basic abuse prevention. Hosting infrastructure may also maintain access logs. Scanned websites can observe the test request in their own server logs.</p>
<h2>AI suggestions</h2><p>When the site operator enables Groq, Viewrift may send a detected CSS selector, issue description, and viewport width to that provider to generate an optional suggestion. No screenshot is sent by the AI suggestion feature. Without an AI key, the tool generates rule-based CSS suggestions.</p>
<h2>Security and limitations</h2><p>Do not scan authenticated sessions, sensitive pages, or private networks. Additional network egress restrictions and distributed abuse controls are necessary before operating an unrestricted public scanner.</p>
<h2>Contact</h2><p>Report a problem at the <Link href="https://github.com/helloskyorigin/Viewrift">Viewrift GitHub project ↗</Link>.</p>
</main>
}