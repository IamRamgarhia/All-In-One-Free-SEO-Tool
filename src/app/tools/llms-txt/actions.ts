"use server";

import { fetchSiteMetadata } from "@/lib/site-metadata";
import { callAI } from "@/lib/ai-call";

export type GenerateLlmsResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export type ValidateLlmsResult =
  | {
      ok: true;
      content: string;
      issues: string[];
      sectionCount: number;
      linkCount: number;
    }
  | { ok: false; error: string };

const SYSTEM = `You generate clean, valid llms.txt files (the proposed AI-readable site directory format).

Format rules:
- Start with H1 (single # line) — the site / brand name
- Then a blockquote (> ) with one-sentence value prop
- Optional H2 sections (## Section name) listing key URLs
- Each link uses markdown format: [Anchor text](https://url) — short description
- Keep it under 80 lines, ≤2000 characters
- Only include URLs the user provided or that are obviously canonical
- No invented URLs

Output ONLY the markdown content. No fences, no commentary.`;

export async function generateLlmsTxt(opts: {
  url: string;
  hint?: string;
}): Promise<GenerateLlmsResult> {
  if (!opts.url?.trim()) return { ok: false, error: "URL is required" };

  const meta = await fetchSiteMetadata(opts.url).catch(() => null);
  if (!meta || !meta.reachable) {
    return { ok: false, error: "Couldn't reach the site to extract metadata." };
  }

  const lines: string[] = [];
  lines.push(`Site URL: ${meta.url}`);
  if (meta.name) lines.push(`Brand name: ${meta.name}`);
  if (meta.description) lines.push(`Description: ${meta.description}`);
  if (meta.address) lines.push(`Address: ${meta.address}`);
  const social = Object.values(meta.socialLinks ?? {}).filter(Boolean);
  if (social.length > 0) lines.push(`Social: ${social.join(", ")}`);
  if (opts.hint) {
    lines.push("");
    lines.push("User notes:");
    lines.push(opts.hint);
  }
  lines.push("");
  lines.push(
    "Generate the llms.txt content now. Markdown only, no fences, no preamble.",
  );

  const raw = await callAI({
    system: SYSTEM,
    user: lines.join("\n"),
    maxTokens: 1500,
    temperature: 0.4,
    timeoutMs: 60_000,
  });

  if (!raw) {
    return {
      ok: false,
      error: "AI provider didn't respond. Set up an API key in Settings.",
    };
  }

  const content = raw
    .trim()
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return { ok: true, content };
}

export async function validateLlmsTxt(
  rawUrl: string,
): Promise<ValidateLlmsResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL is required" };
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  const llmsUrl = `${origin}/llms.txt`;

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 10_000);
  let body = "";
  try {
    const res = await fetch(llmsUrl, { signal: c.signal });
    if (!res.ok) {
      return {
        ok: false,
        error: `No llms.txt found at ${llmsUrl} (${res.status}).`,
      };
    }
    body = await res.text();
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't fetch llms.txt: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(t);
  }

  const issues: string[] = [];
  if (!/^#\s+\S/m.test(body)) {
    issues.push("Missing top-level H1 (single # line at the start).");
  }
  if (!/^>\s+\S/m.test(body)) {
    issues.push("Missing blockquote with the one-sentence value prop.");
  }
  if (body.length > 2000) {
    issues.push(
      `File is ${body.length} chars — most parsers expect ≤ 2000.`,
    );
  }
  if (body.length < 50) {
    issues.push("File looks too short — add a description and key links.");
  }

  const sectionCount = (body.match(/^##\s+/gm) ?? []).length;
  const linkCount = (body.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length;

  return { ok: true, content: body, issues, sectionCount, linkCount };
}
