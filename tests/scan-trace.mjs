import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const tracePath=join(".next","server","app","api","scan","route.js.nft.json");
assert.ok(existsSync(tracePath),`Next.js did not produce the scanner file trace at ${tracePath}`);
const trace=JSON.parse(readFileSync(tracePath,"utf8"));
const files=trace.files || [];
function check(filename){
  assert.ok(files.some(f=>f.replaceAll("\\","/").endsWith(filename)),`Scanner missing runtime asset from Next.js file trace: ${filename}. Inspect outputFileTracingIncludes in next.config.ts`);
  console.log("✓ traced:",filename);
}
check("node_modules/playwright-core/browsers.json");
check("node_modules/@sparticuz/chromium/bin/chromium.br");
console.log("Viewrift scan runtime packages included in build trace.");
