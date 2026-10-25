import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const PORT=3201;
const simulatedDevices = [
 {id:"android",label:"Android",width:360,height:800,family:"mobile"},
 {id:"iphone",label:"iPhone",width:390,height:844,family:"mobile"},
 {id:"tablet",label:"Tablet",width:768,height:1024,family:"tablet"},
 {id:"laptop",label:"Laptop",width:1366,height:768,family:"desktop"},
 {id:"desktop",label:"Desktop",width:1920,height:1080,family:"desktop"},
];
const fixtureImage="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="100%" height="100%" fill="#eef2ff"/></svg>').toString("base64");
const mockEvents=[
 {type:"start",url:"https://example.com"},
 ...simulatedDevices.flatMap(device=>[
   {type:"device_start",deviceId:device.id},
   {type:"device_result",result:{device,status:"pass",issues:[],screenshot:fixtureImage,loadMs:300,
     diagnostics:{title:"Example Domain",documentWidth:device.width,overflowPixels:0,elementsInspected:6,interactiveElements:1,imagesFound:0,imagesBroken:0}}},
 ]),
 {type:"done"},
].map(event=>JSON.stringify(event)).join("\n")+"\n";

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
  await page.route("**/api/scan",async route => {
   await new Promise(resolve=>setTimeout(resolve,450));
   await route.fulfill({status:200,contentType:"application/x-ndjson",body:mockEvents});
  });
  assert.equal(await page.locator(".sample-link").count(),0,"Demo entry must not exist");
  await page.locator("#url-input").fill("https://example.com");
  await page.locator(".url-form button").click();
  await page.locator(".scan-panel").waitFor();
  assert.equal(await page.locator(".report-page").count(),0,"Report must not show during scan");
  await page.locator(".capture-grid").waitFor({timeout:12000});
  assert.equal(await page.locator(".capture-tile").count(),5,"All five real screenshot slots must be visible");
  assert.equal(await page.locator(".capture-tile img").count(),5,"Each checked device needs image evidence");
  assert.equal(await page.locator(".diagnostics-grid").count(),1,"Actual DOM evidence panel missing");
  assert.equal(await page.locator(".scan-preview-action").count(),0,"Early one-screen results CTA should be removed");
  await page.unroute("**/api/scan");
  
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
