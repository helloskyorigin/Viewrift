import type { Issue } from "./types";
import { validateTemporaryCSS } from "./safety";

export async function improveFixWithGroq(issue: Issue, viewport: number): Promise<Issue> {
  const key = process.env.GROQ_API_KEY;
  if (!key || process.env.DISABLE_AI === "true") return issue;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          { role: "system", content: "You are a cautious CSS debugging assistant. Given a static issue report, suggest only a small CSS patch. No @import, url(), JS, HTML, or external resources. Return JSON only with keys suggestion and css. Never claim the patch is verified. A selector may not exist or be unique; avoid broad global changes." },
          { role: "user", content: JSON.stringify({ type: issue.type, selector: issue.selector, description: issue.description, viewport }) },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return issue;
    const data = await response.json();
    const raw = String(data.choices?.[0]?.message?.content || "");
    const parsed = JSON.parse(raw) as { suggestion?: string; css?: string };
    if (!parsed.css || !parsed.suggestion || parsed.css.length > 1800) return issue;
    try { validateTemporaryCSS(parsed.css); } catch { return issue; }
    return { ...issue, suggestion: parsed.suggestion.slice(0, 450), css: parsed.css, ai: true };
  } catch { return issue; }
}
