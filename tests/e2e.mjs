import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const PORT=3201;
const base="http://127.0.0.1:"+PORT;
const server=spawn("node_modules/.bin/next",["start","--hostname","127.0.0.1","--port",String(PORT)],{stdio:"inherit",env:{...process.env,PORT:String(PORT),DISABLE_AI:"true",NEXT_TELEMETRY_DISABLED:"1"}});
const sleep=(n)=>new Promise(resolve=>setTimeout(resolve,n));
async function ready(){for(let attempt=0;attempt<40;attempt++){try{const r=await fetch(base+"/api/health",{signal:AbortSignal.timeout(2000)});if(r.ok)return;}catch{}await sleep(1000);}throw Error("Viewrift server did not start");}
try{
 await ready();
 for(const path of ["/","/privacy","/terms","/demo-site"]){const r=await fetch(base+path);assert.equal(r.status,200,path+" failed");}
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base);await page.locator("#url-input").waitFor();
  assert.equal(await page.locator(".brand-mark svg").count(),1,"Logo SVG missing");
  await page.locator(".sample-link").click();
  await page.getByText("SAMPLE DATA").waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+3);
  assert.equal(overflow,false,"Mobile report overflows horizontally");
 }finally{await browser.close();}
 let r=await fetch(base+"/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"http://127.0.0.1"})});
 assert.equal(r.status,400,"Local IP must be blocked");
 r=await fetch(base+"/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:"https://example.com",deviceIds:["android"]}),signal:AbortSignal.timeout(100000)});
 assert.equal(r.status,200,"Scanner did not stream");
 const lines=(await r.text()).trim().split("\n").map(line=>JSON.parse(line));
 const result=lines.find(x=>x.type==="device_result");
 assert.ok(lines.some(x=>x.type==="device_start"),"Missing streamed progress");
 assert.ok(result,"Missing browser scan result");
 assert.notEqual(result.result.status,"error",result.result.error);
 assert.ok(result.result.screenshot?.startsWith("data:image/jpeg;base64,"),"Missing Chromium screenshot");
 console.log("Production smoke succeeded.");
}finally{server.kill("SIGTERM");}
