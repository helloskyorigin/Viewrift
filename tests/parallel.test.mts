import assert from "node:assert/strict";
import { test } from "node:test";
import { mapWithConcurrency } from "../lib/scan-queue.ts";

test("bounded worker pool scans all 5 viewports using at most 2 active contexts", async () => {
  let running = 0, max = 0;
  const results: number[] = [];
  await mapWithConcurrency([360, 390, 768, 1366, 1920], 2, async width => {
    running++;
    max = Math.max(running, max);
    await new Promise(r => setTimeout(r, width === 360 ? 25 : 2));
    results.push(width);
    running--;
  });
  assert.equal(max, 2);
  assert.deepEqual(results.slice().sort((a,b)=>a-b), [360,390,768,1366,1920].sort((a,b)=>a-b));
  assert.notEqual(results[0],360,"faster viewport should finish before the slow first viewport");
});
test("one-device CSS retest uses only one worker", async () => {
  let n=0; await mapWithConcurrency(["android"],2,async()=>{n++}); assert.equal(n,1);
});
