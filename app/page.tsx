"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, Clipboard, Code2, ExternalLink, Eye, FileSearch, GitBranch,
  Globe2, Laptop, LayoutTemplate, Link2, LoaderCircle, Menu, Monitor, MonitorSmartphone,
  MousePointer2, RefreshCw, ScanLine, ShieldCheck, Smartphone, Sparkles, Tablet,
  TriangleAlert, WandSparkles, X, Zap
} from "lucide-react";
import { DEVICES, type Device, type DeviceResult, type Issue, type StreamEvent } from "@/lib/types";

type Phase = "landing" | "scanning" | "results";
type DeviceState = "pending" | "scanning" | "complete";
const sampleIssues: Record<string, Issue[]> = {
  android: [{ id: "sample-a", type: "element-overflow", severity: "high", title: "Element exceeds viewport", description: "A fixed-width product card extends outside the 360px viewport.", selector: ".feature-card", rect: {x:210,y:260,width:240,height:120}, suggestion: "Constrain the card to its container and allow flex items to shrink.", css: "@media (max-width: 768px) {\n  .feature-card {\n    min-width: 0;\n    max-width: 100%;\n  }\n}" }],
  tablet: [{ id: "sample-t", type: "overlap", severity: "medium", title: "Possible interactive overlap", description: "Two top navigation links overlap in this example layout.", selector: ".nav-actions", rect: {x:530,y:30,width:140,height:46}, suggestion: "Review spacing and allow navigation to wrap on tablet widths.", css: "@media (max-width: 900px) {\n  .nav-actions {\n    flex-wrap: wrap;\n    gap: 12px;\n  }\n}" }]
};
const sampleResults: DeviceResult[] = DEVICES.map(device => ({ device, status: sampleIssues[device.id]?.length ? "issues" : "pass", issues: sampleIssues[device.id] || [], screenshot: null }));

function DeviceIcon({ device, size = 20 }: { device: Device; size?: number }) {
  if (device.id === "tablet") return <Tablet size={size} strokeWidth={1.8} />;
  if (device.family === "mobile") return <Smartphone size={size} strokeWidth={1.8} />;
  if (device.id === "laptop") return <Laptop size={size} strokeWidth={1.8} />;
  return <Monitor size={size} strokeWidth={1.8} />;
}

function Logo() {
  return <div className="brand"><span className="brand-mark"><ScanLine size={20} strokeWidth={2.6}/></span><span>viewrift<span className="brand-period">.</span></span></div>;
}

function DeviceMini({ d, className = "" }: { d: Device; className?: string }) {
  return <div className={`device-mini ${className}`}><div className="mini-top"><div className="mini-dot"/><div className="mini-line"/></div><div className="mini-content"><div className="mini-heading"/><div className="mini-line-long"/><div className="mini-line-short"/><div className="mini-image"/><div className="mini-button"/></div><div className="mini-foot"/></div>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("landing");
  const [input, setInput] = useState("");
  const [scannedUrl, setScannedUrl] = useState("");
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deviceStates, setDeviceStates] = useState<Record<string, DeviceState>>({});
  const [results, setResults] = useState<DeviceResult[]>([]);
  const [selectedId, setSelectedId] = useState<Device["id"]>("android");
  const [selectedIssue, setSelectedIssue] = useState(0);
  const [sample, setSample] = useState(false);
  const [retesting, setRetesting] = useState(false);
  const [retestMessage, setRetestMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const selectedResult = results.find(r => r.device.id === selectedId);
  const issue = selectedResult?.issues[selectedIssue] || selectedResult?.issues[0];
  const issuesCount = results.reduce((n, r) => n + r.issues.length, 0);
  const passedCount = results.filter(r => r.status === "pass").length;
  const completedCount = Object.values(deviceStates).filter(x => x === "complete").length;
  const hostname = useMemo(() => { try { return new URL(scannedUrl.includes("://") ? scannedUrl : `https://${scannedUrl}`).hostname; } catch { return scannedUrl; } }, [scannedUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function readStream(response: Response, onResult: (r: DeviceResult) => void, onStart?: (id: string) => void) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(typeof payload.error === "string" ? payload.error : `Scan failed (${response.status}).`);
    }
    if (!response.body) throw new Error("The server did not return scan data.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ended = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const item = JSON.parse(line) as StreamEvent;
        if (item.type === "device_start") onStart?.(item.deviceId);
        if (item.type === "device_result") onResult(item.result);
        if (item.type === "error") throw new Error(item.message);
        if (item.type === "done") ended = true;
      }
    }
    if (!ended) throw new Error("Scan ended unexpectedly. Please retry.");
  }

  async function runScan(raw: string) {
    if (!raw.trim()) { setError("Enter your website URL to start."); return; }
    abortRef.current?.abort();
    const controller = new AbortController(); abortRef.current = controller;
    setScannedUrl(raw.trim()); setInput(raw.trim()); setError(""); setSample(false); setResults([]);
    setDeviceStates(Object.fromEntries(DEVICES.map(d => [d.id, "pending"])));
    setSelectedId("android"); setSelectedIssue(0); setRetestMessage("");
    setPhase("scanning"); window.scrollTo({top:0,behavior:"smooth"});
    try {
      await readStream(
        await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({url: raw}), signal: controller.signal }),
        result => { setResults(prev => [...prev.filter(r => r.device.id !== result.device.id), result]); setDeviceStates(prev => ({...prev,[result.device.id]:"complete"})); },
        id => setDeviceStates(prev => ({...prev,[id]:"scanning"})),
      );
      setPhase("results");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Could not complete this scan.");
      setPhase("landing");
    }
  }

  function loadSample() {
    setScannedUrl("https://sample.viewrift.dev"); setSample(true); setError(""); setResults(sampleResults);
    setDeviceStates(Object.fromEntries(DEVICES.map(d => [d.id, "complete"])));
    setSelectedId("android"); setSelectedIssue(0); setRetestMessage(""); setPhase("results");
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function reset() { abortRef.current?.abort(); setPhase("landing"); setError(""); setRetestMessage(""); window.scrollTo({top:0,behavior:"smooth"}); }
  async function retest() {
    if (!selectedResult || !issue || sample || retesting) return;
    setRetesting(true); setRetestMessage("");
    try {
      let after: DeviceResult | undefined;
      await readStream(await fetch("/api/scan", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:scannedUrl,patch:issue.css,deviceIds:[selectedId]}) }), r => { after=r; });
      if (!after) throw new Error("No retest result returned.");
      const previous = issue;
      const stillFound = after.issues.some(candidate => candidate.type === previous.type && candidate.selector === previous.selector);
      setResults(prev => prev.map(r => r.device.id === selectedId ? after! : r));
      setRetestMessage(after.status === "error" ? "Retest could not load the page. No fix has been verified." : stillFound ? "The same issue is still detected after applying this CSS." : "This specific issue is no longer detected with the temporary patch. Review the screenshot before using it.");
      setSelectedIssue(0);
    } catch (err) { setRetestMessage(err instanceof Error ? err.message : "Retest failed."); }
    finally { setRetesting(false); }
  }
  async function copyFix() {
    if (!issue) return;
    try { await navigator.clipboard.writeText(issue.css); setCopied(true); window.setTimeout(() => setCopied(false),1800); } catch { setRetestMessage("Clipboard unavailable. Select and copy the CSS manually."); }
  }

  return <main className="site-root">
    {phase === "landing" ? <>
      <header className="site-header"><div className="wrap header-content"><a href="#top" aria-label="Viewrift home" className="brand-link"><Logo/></a><nav className={`nav-links ${menuOpen ? "open" : ""}`}><a onClick={() => setMenuOpen(false)} href="#how">How it works</a><a onClick={() => setMenuOpen(false)} href="#screens">Screen sizes</a><a onClick={() => setMenuOpen(false)} href="#faq">FAQs</a></nav><button className="nav-action" onClick={() => document.getElementById("url-input")?.focus()}>Start testing <ArrowUpRight size={16}/></button><button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setMenuOpen(s => !s)}>{menuOpen ? <X/> : <Menu/>}</button></div></header>
      <section id="top" className="hero wrap"><div className="hero-text"><div className="eyebrow"><span className="eyebrow-dot"/> BUILT FOR THE DETAILS THAT MATTER</div><h1>A great website should look right <em>everywhere.</em></h1><p className="hero-desc">Your design might look perfect on your screen. Viewrift checks the other four, so your visitors never have to find the bugs.</p><form className="url-form" onSubmit={e => {e.preventDefault(); void runScan(input);}}><label htmlFor="url-input" className="visually-hidden">Website URL</label><Link2 size={19} strokeWidth={1.9}/><input id="url-input" type="text" autoCapitalize="none" autoComplete="url" spellCheck={false} placeholder="https://yourwebsite.com" value={input} onChange={e => {setInput(e.target.value); setError("");}}/><button type="submit">Test my website <ArrowRight size={18}/></button></form>{error && <p className="form-error" role="alert"><TriangleAlert size={15}/>{error}</p>}<div className="hero-under"><span><Check size={15}/> Five essential viewports</span><span><Check size={15}/> No signup required</span><span><Check size={15}/> Free to try</span></div><button className="sample-link" onClick={loadSample}>Explore a sample report <ArrowUpRight size={15}/></button></div>
        <div className="hero-art" aria-label="Illustration of responsive device preview"><div className="hero-orbit orbit-a"/><div className="hero-orbit orbit-b"/><div className="art-card"><div className="art-card-head"><span className="window-dots"><i/><i/><i/></span><span className="art-host">yourwebsite.com</span><span className="art-indicator"><span/> ALL SCREENS</span></div><div className="art-topline"><span>RESPONSIVE OVERVIEW</span><span>5 VIEWPORTS</span></div><div className="hero-devices"><DeviceMini d={DEVICES[4]} className="art-desktop"/><DeviceMini d={DEVICES[2]} className="art-tablet"/><DeviceMini d={DEVICES[0]} className="art-phone"/></div><div className="art-bottom"><span className="art-bottom-icon"><ScanLine size={17}/></span><span>One URL. Five perspectives.</span><span className="art-bottom-check"><Check size={17}/></span></div></div><div className="floating-chip"><span className="float-check"><Check size={14}/></span><span>Catch issues before launch</span></div></div>
      </section>
      <section className="trust-line"><div className="wrap trust-content"><span className="trust-icon"><ShieldCheck size={17}/></span><p>Not another website score. <b>Actual browser screenshots, measurable issues, and fixes you can review.</b></p></div></section>
      <section id="screens" className="section wrap"><div className="section-top"><div><div className="kicker">THE RIGHT COVERAGE</div><h2>Five screens.<br/>No blind spots in your essentials.</h2></div><p>Skip the endless device lists. Start with five practical viewport sizes that cover the core mobile-to-desktop experience.</p></div><div className="screen-grid">{DEVICES.map((d,i) => <div className="screen-card" key={d.id}><span className="screen-index">0{i+1}</span><span className="screen-icon"><DeviceIcon device={d} size={27}/></span><div><h3>{d.label}</h3><p>{d.width} × {d.height} px</p></div></div>)}</div><p className="screen-note"><CircleHelp size={15}/> Viewport dimensions, not a claim to physically emulate every device or browser.</p></section>
      <section id="how" className="section section-how"><div className="wrap"><div className="center-section"><div className="kicker">THREE STEPS. ZERO FRICTION.</div><h2>From “looks good to me”<br/>to “ready for everyone.”</h2><p>Everything you need to spot and improve responsive layout problems in one clean workflow.</p></div><div className="steps-grid"><div className="step-card"><div className="step-visual step-visual-one"><div className="fake-address"><Globe2 size={16}/> yourwebsite.com <ArrowRight size={16}/></div></div><div className="step-n">01 / START</div><h3>Drop your URL.</h3><p>No code uploads, extensions, accounts, or elaborate setup. Just enter a public webpage.</p></div><div className="step-card"><div className="step-visual step-visual-two"><div className="fake-scan"><span className="scan-frame"><MonitorSmartphone size={31}/></span><div><b>Checking layouts</b><span><i/> Android · iPhone · Tablet</span></div></div></div><div className="step-n">02 / SCAN</div><h3>See it through five screens.</h3><p>A real Chromium browser captures each view and checks for overflow and possible interactive overlaps.</p></div><div className="step-card"><div className="step-visual step-visual-three"><div className="fake-issue"><span><TriangleAlert size={16}/> Overflow found</span><div className="fake-fix">max-width: 100%;</div></div></div><div className="step-n">03 / IMPROVE</div><h3>Know exactly what to fix.</h3><p>Review highlighted evidence, copy suggested CSS, and retest a temporary fix without changing your live site.</p></div></div></div></section>
      <section className="cta-section wrap"><div className="cta-banner"><div className="cta-glow"/><div className="cta-content"><div className="cta-kicker">READY WHEN YOU ARE</div><h2>Don't ship the surprise.</h2><p>Find the small layout bugs before your users find them for you.</p><button onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({top:0,behavior:"smooth"}); }}>Test my website <ArrowRight size={17}/></button></div><div className="cta-symbol"><ScanLine size={132} strokeWidth={0.75}/></div></div></section>
      <section id="faq" className="section wrap faq-section"><div className="faq-head"><div className="kicker">COMMON QUESTIONS</div><h2>The details, clarified.</h2></div><div className="faq-list"><FAQ q="Is Viewrift really free?" a="Yes. This hackathon MVP has no accounts or payments. Scan limits help keep the shared testing server available."/><FAQ q="Does this change my website?" a="No. Viewrift opens your public URL inside isolated browser sessions. Suggested CSS changes are only applied temporarily during retests, never to your live website."/><FAQ q="Will it find every responsive issue?" a="No automated tool can guarantee that. Viewrift measures horizontal overflow, elements outside the viewport, and possible overlapping interactive elements. The screenshots make manual review easy."/><FAQ q="Why are there only five sizes?" a="We intentionally chose a concise set: 360×800, 390×844, 768×1024, 1366×768, and 1920×1080. Extra device sizes can be added later."/></div></section>
      <footer className="site-footer"><div className="wrap footer-content"><Logo/><span>Built to help good websites feel great on every screen.</span><span>© 2026 Viewrift · Hackathon MVP</span></div></footer>
    </> : <>
      <header className="app-header"><div className="wrap app-header-inner"><button className="app-home" onClick={reset} aria-label="Return home"><Logo/></button><div className="app-header-right"><span className="app-mode">{phase === "scanning" ? "Live scan" : "Scan report"}</span><button className="text-btn" onClick={reset}><ArrowLeft size={16}/> New test</button></div></div></header>
      {phase === "scanning" ? <section className="scan-page wrap"><div className="scan-header"><span className="scan-large-icon"><ScanLine size={34}/></span><div className="kicker">LIVE BROWSER SCAN</div><h1>Checking every screen<span className="moving-dots">...</span></h1><p>Real Chromium sessions are loading <b>{hostname}</b> across five viewport sizes. Screenshots and results will appear as each test completes.</p></div><div className="scan-panel"><div className="scan-panel-head"><div><span className="scan-caption">SCAN PROGRESS</span><h2>{completedCount} of 5 screens completed</h2></div><span className="scan-percent">{Math.round(completedCount / 5 * 100)}%</span></div><div className="progress-track"><div style={{width:`${completedCount / 5 * 100}%`}}/></div><div className="scan-rows">{DEVICES.map(d => <div className="scan-row" key={d.id}><span className="scan-device-ico"><DeviceIcon device={d}/></span><span className="scan-name"><b>{d.label}</b><small>{d.width} × {d.height}</small></span><span className={`scan-state scan-${deviceStates[d.id] || "pending"}`}>{deviceStates[d.id] === "complete" ? <><CheckCircle2 size={17}/> Complete</> : deviceStates[d.id] === "scanning" ? <><LoaderCircle size={17} className="spin"/> Scanning</> : "Waiting"}</span></div>)}</div></div><p className="scan-note"><ShieldCheck size={17}/> The scan only reads your website. It doesn't modify your production code.</p></section> :
      <section className="report-page wrap"><div className="report-title-row"><div><span className="report-eyebrow">RESPONSIVE TEST REPORT {sample && <span className="sample-tag">SAMPLE DATA</span>}</span><h1>Here's how your site holds up.</h1><p><Globe2 size={16}/> {hostname} <span>·</span> {results.length} screen sizes tested</p></div><button className="secondary-btn" onClick={() => sample ? loadSample() : void runScan(scannedUrl)}><RefreshCw size={16}/> Run again</button></div>
        {sample && <div className="sample-note"><Eye size={17}/> You're viewing an illustrative report. Screenshots and issues here are examples, not results from a real scan. <button onClick={reset}>Run a live scan <ArrowRight size={14}/></button></div>}
        <div className="metrics"><div className="metric"><span>SCREEN SIZES</span><strong>{results.length}<small> / 5</small></strong><p>viewports checked</p></div><div className="metric"><span>PASSED</span><strong className="metric-pass">{passedCount}</strong><p>no measured issues</p></div><div className="metric"><span>ISSUES FOUND</span><strong className="metric-alert">{issuesCount}</strong><p>automated findings</p></div></div>
        <div className="report-layout"><aside className="report-side"><div className="panel-title"><h2>Device results</h2><span>{results.length} sizes</span></div><div className="result-devices">{DEVICES.map(d => { const result=results.find(r=>r.device.id===d.id); return <button key={d.id} className={`device-result ${selectedId===d.id?"selected":""}`} onClick={() => {setSelectedId(d.id);setSelectedIssue(0);setRetestMessage("");}}><span className="result-device-icon"><DeviceIcon device={d}/></span><span className="result-device-copy"><b>{d.label}</b><small>{d.width} × {d.height}</small></span><span className={`status-dot ${result?.status === "pass" ? "passed" : result?.status === "issues" ? "failed" : "neutral"}`}/><ChevronRight size={16} className="result-chevron"/></button>; })}</div><div className="side-tip"><Sparkles size={19}/><strong>What gets checked?</strong><p>Visible horizontal overflow, offscreen elements, and likely overlapping clickable controls.</p></div></aside>
          <div className="report-main"><div className="panel-title panel-title-main"><div><span className="panel-kicker">VIEWPORT PREVIEW</span><h2>{selectedResult?.device.label || "Device"} <span>· {selectedResult?.device.width} × {selectedResult?.device.height}</span></h2></div><span className={`result-label ${selectedResult?.status || "error"}`}>{selectedResult?.status === "pass" ? <><CheckCircle2 size={14}/> No issues found</> : selectedResult?.status === "issues" ? <><TriangleAlert size={14}/> {selectedResult.issues.length} finding{selectedResult.issues.length===1?"":"s"}</> : "Load failed"}</span></div>
          <div className="preview-canvas"><div className="preview-toolbar"><div className="browser-dots"><i/><i/><i/></div><div className="browser-url"><Globe2 size={13}/>{hostname}</div><span className="preview-dim">{selectedResult?.device.width} × {selectedResult?.device.height}</span></div><div className="preview-stage">{selectedResult?.screenshot ? <div className={`preview-screen ${selectedResult.device.family}`} style={{aspectRatio:`${selectedResult.device.width}/${selectedResult.device.height}`,maxWidth:selectedResult.device.family === "mobile" ? "245px" : selectedResult.device.family === "tablet" ? "395px" : "100%"}}><img src={selectedResult.screenshot} alt={`${selectedResult.device.label} viewport screenshot`} /><div className="screenshot-guide">{issue?.rect && <div className="issue-frame" style={{left:`${Math.max(0,Math.min(100,issue.rect.x/selectedResult.device.width*100))}%`,top:`${Math.max(0,Math.min(100,issue.rect.y/selectedResult.device.height*100))}%`,width:`${Math.max(1,Math.min(100,issue.rect.width/selectedResult.device.width*100))}%`,height:`${Math.max(1,Math.min(100,issue.rect.height/selectedResult.device.height*100))}%`}}><span>Issue</span></div>}</div></div> : <div className="preview-empty"><MonitorSmartphone size={42}/><h3>{sample ? "Example screenshot area" : "No screenshot available"}</h3><p>{sample ? "A live scan displays an actual Chromium capture of your website here." : selectedResult?.error || "This viewport could not be captured."}</p></div>}</div></div>
          <div className="findings"><div className="findings-top"><div><span className="panel-kicker">ISSUE ANALYSIS</span><h2>Findings & suggested fixes</h2></div><span className="find-count">{selectedResult?.issues.length || 0} found</span></div>
          {selectedResult?.status === "error" ? <div className="empty-state"><TriangleAlert size={23}/><b>Could not test this viewport</b><p>{selectedResult.error || "Please try again."}</p></div> : selectedResult?.issues.length ? <><div className="issue-list">{selectedResult.issues.map((it,i) => <button key={it.id} onClick={()=>{setSelectedIssue(i);setRetestMessage("");}} className={`issue-item ${selectedIssue===i?"active":""}`}><span className="issue-warning"><TriangleAlert size={17}/></span><span><strong>{it.title}</strong><small>{it.selector} · {it.severity} priority</small></span><ChevronRight size={17}/></button>)}</div><div className="fix-card"><div className="fix-head"><div><span className="fix-eyebrow">WHAT WE FOUND</span><h3>{issue?.title}</h3></div><span className="severity">{issue?.severity} priority</span></div><p>{issue?.description}</p><div className="suggestion"><WandSparkles size={19}/><div><b>{issue?.ai ? "AI suggested improvement" : "Suggested improvement"}</b><p>{issue?.suggestion}</p></div></div><div className="code-head"><span><Code2 size={15}/> Suggested CSS</span><button onClick={() => void copyFix()}><Clipboard size={14}/>{copied ? "Copied" : "Copy"}</button></div><pre className="css-code"><code>{issue?.css}</code></pre><div className="fix-actions"><button className="primary-small" onClick={()=>void retest()} disabled={sample || retesting}>{retesting?<LoaderCircle size={16} className="spin"/>:<RefreshCw size={16}/>} {retesting?"Retesting...":"Apply temporarily & retest"}</button><span>This will not change your live site.</span></div>{retestMessage && <div className="retest-note" role="status">{retestMessage}</div>}</div></> : <div className="empty-state"><CheckCircle2 className="safe-check" size={30}/><b>No issues detected on this viewport.</b><p>That's a good sign, but automated checks can't catch every visual or usability problem. Review the screenshot above.</p></div>}
          </div></div></div><div className="report-disclaimer"><ShieldCheck size={18}/><p>Viewrift uses automated browser heuristics. Suggestions are not verified fixes until retested; passing checks never guarantees a bug-free website.</p></div></section>}
    </>}
  </main>;
}

function FAQ({q,a}: {q:string;a:string}) {
  const [open,setOpen]=useState(false);
  return <div className={`faq-item ${open?"expanded":""}`}><button onClick={()=>setOpen(x=>!x)} aria-expanded={open}><span>{q}</span><ChevronDown size={21}/></button>{open && <p>{a}</p>}</div>;
}
