import Link from "next/link";
export const metadata = { title: "Terms | Viewrift" };
export default function Terms(){return <main className="legal-page"><Link href="/" className="legal-back">← Viewrift</Link><h1>Use Viewrift responsibly</h1>
<p className="legal-lede">Viewrift performs automated, best-effort responsive layout checks—not a security audit, accessibility certification, or bug-free guarantee.</p>
<h2>Authorized use</h2><p>Submit only websites you own or have permission to test. Do not use this service against private, authenticated, internal or prohibited services. Respect applicable laws and website terms.</p>
<h2>Results and fixes</h2><p>Detections are heuristic and incomplete. Suggested CSS is for manual review. Temporary retests do not modify your production source code.</p>
<h2>Availability</h2><p>This hackathon project has usage limits, experimental availability and no uptime guarantee.</p>
<h2>Questions</h2><p>Visit the <Link href="https://github.com/helloskyorigin/Viewrift">Viewrift GitHub project ↗</Link>.</p>
</main>}