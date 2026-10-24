import type { Issue } from "./types";

export function issueFix(type: Issue["type"], selector: string, viewport: number): { suggestion: string; css: string } {
  // CSS selectors are read from target sites. Only use unambiguous selectors
  // and keep proposed fixes reviewable before users copy them.
  const breakpoint = Math.min(2560, Math.max(320, viewport));
  const safe = /^[#.]?[A-Za-z_-][A-Za-z0-9_\-#. :>+\[\]="'()]{0,140}$/.test(selector)
    ? selector : ".replace-with-element-selector";
  if (type === "horizontal-overflow") return {
    suggestion: "Find the element exceeding viewport width. Prefer fixing that element over hiding page overflow.",
    css: `/* Inspect overflowing child first */\n${safe} { max-width: 100%; box-sizing: border-box; }`,
  };
  if (type === "element-overflow") return {
    suggestion: "Constrain the element width and allow long content to wrap. Check fixed widths and min-width rules.",
    css: `@media (max-width: ${breakpoint}px) {\n  ${safe} {\n    max-width: 100%;\n    min-width: 0;\n    overflow-wrap: anywhere;\n  }\n}`,
  };
  return {
    suggestion: "Inspect overlapping fixed/sticky elements and reserve space or reduce sizing at this breakpoint.",
    css: `/* Review layout for overlapping elements */\n@media (max-width: ${breakpoint}px) {\n  ${safe} { max-width: 100%; }\n}`,
  };
}
