import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
const PORT=3212,base=`http://127.0.0.1:${PORT}`;
const sizes=[[360,800],[390,844],[768,1024],[1366,768],[1920,1080]];
const server=spawn("node_modules/.bin/next",["start","--hostname","127.0.0.1","--port",String(PORT)],{stdio:"inherit",env:{...process.env,PORT:String(PORT)}});
async function ready(){for(let i=0;i<45;i++){try{const r=await fetch(base+"/api/health",{signal:AbortSignal.timeout(1500)});if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,1000))}throw Error("Server did not start")}
async function check(page,selectors,phase,width){
 const result=await page.evaluate(selectors=>{
  const clipped=[];
  for(const selector of selectors)for(const e of document.querySelectorAll(selector)){
   const s=getComputedStyle(e),r=e.getBoundingClientRect();
   if(s.display==="none"||s.visibility==="hidden"||r.width<1||r.height<1)continue;
   if(r.left< -3||r.right>innerWidth+3)clipped.push({selector,left:Math.round(r.left),right:Math.round(r.right)});
  }
  return {mainWidth:document.querySelector("main").scrollWidth,clipped};
 },selectors);
 assert.ok(result.mainWidth<=width+3,`${phase}/${width}px hidden overflow: ${JSON.stringify(result)}`);
 assert.deepEqual(result.clipped,[],`${phase}/${width}px clipped UI: ${JSON.stringify(result)}`);
}
const landing=[".hero-text",".hero h1",".url-form",".url-form input",".url-form button",".screen-grid",".screen-card",".steps-grid",".step-card",".cta-banner",".faq-list"];
const results=[".report-title-row",".report-actions",".metrics",".metric",".report-layout",".report-side",".report-main",".result-devices",".device-result",".preview-canvas",".findings",".fix-card"];
const scanning=[".scan-header",".scan-panel",".scan-row",".scan-note"];
try{
 await ready();const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.goto(base);await page.locator("#url-input").waitFor();
   await check(page,landing,"Landing",width);
   await page.locator(".sample-link").click();await page.getByText("SAMPLE DATA").waitFor();
   await check(page,results,"Results",width);
  }
  await page.route("**/api/scan",async route=>{await new Promise(r=>setTimeout(r,1200));await route.fulfill({status:400,contentType:"application/json",body:'{"error":"UI test"}'}).catch(()=>{})});
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});await page.goto(base);
   await page.locator("#url-input").fill("https://example.com");await page.locator(".url-form button").click();
   await page.locator(".scan-panel").waitFor();await check(page,scanning,"Scanning",width);
  }
  await page.unrouteAll({behavior:"ignoreErrors"});await page.close();
  console.log("Viewrift responsive test PASS: 3 screens × 5 viewports");
 }finally{await browser.close()}
}finally{server.kill("SIGTERM")}
