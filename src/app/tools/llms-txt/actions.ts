"use server";

/**
 * @ai-partial
 *
 * Generating a file needs a model. Validating one does not, and
 * validation is what the nightly sweep runs.
 *
 * See tool-capabilities.derive.ts — this marker is what stops the badge
 * saying the whole page is unavailable when it is not.
 */

import { fetchSiteMetadata } from "@/lib/site-metadata";
import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";
import { saveToolRun } from "@/lib/tool-runs";
import { recordToolRun, type FindingDraft } from "@/lib/tool-findings";
import { guardedFetch } from "@/lib/url-guard";

export type GenerateLlmsResult =
  | { ok: true; content: string; aiFailure?: AiFailure | null }
  | { ok: false; error: string };

export type ValidateLlmsResult =
  | {
      ok: true;
      /**
       * Whether the site actually has an llms.txt.
       *
       * "There is no file" is an answer, not a failure, and it used to
       * be reported as `ok: false` — so the tool recorded nothing, the
       * nightly sweep logged a broken check, and a site with no llms.txt
       * left no trace that anyone had ever looked. The distinction that
       * matters is between a check that could not run and a check that
       * ran and found nothing.
       */
      present: boolean;
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

  await saveToolRun({
    toolId: "llms-txt",
    label: `${opts.url} · generated (${content.length} chars)`,
    input: { url: opts.url, hint: opts.hint },
    result: { ok: true, content },
  }).catch(() => undefined);
  return { ok: true, content, aiFailure: lastAiFailure() };
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
  let present = true;
  try {
    const res = await guardedFetch(llmsUrl, { signal: c.signal });
    // A 404 is a definite answer about the site. Only a fetch that never
    // completed is a check that could not run.
    if (res.status === 404 || res.status === 410) present = false;
    else if (!res.ok) {
      return {
        ok: false,
        error: `Couldn't read ${llmsUrl} (${res.status}).`,
      };
    } else body = await res.text();
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't fetch llms.txt: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(t);
  }

  if (!present) {
    // Recorded, and deliberately with no finding.
    //
    // llms.txt is a proposal, not a standard any search engine has
    // committed to. Raising "you are missing llms.txt" as work would put
    // this tool on the wrong side of its own rule about folklore — the
    // same rule that keeps keyword density and directory submission out.
    // Absence is reported, and left as the user's call.
    const absent = {
      ok: true as const,
      present: false,
      content: "",
      issues: [] as string[],
      sectionCount: 0,
      linkCount: 0,
    };
    await recordToolRun({
      toolId: "llms-txt",
      label: `${llmsUrl} · not present`,
      input: { url: rawUrl },
      result: absent,
      findings: [],
    });
    return absent;
  }

  const issues: string[] = [];
  // The same problems with an identity that survives a re-run. The
  // strings above carry the file's current length, so a signature built
  // from one would change every time the file is edited and could never
  // be marked resolved.
  const findings: FindingDraft[] = [];

  if (!/^#\s+\S/m.test(body)) {
    issues.push("Missing top-level H1 (single # line at the start).");
    findings.push({
      signature: "llms-txt.no_h1",
      title: "llms.txt has no top-level heading",
      severity: "medium",
      category: "ai-visibility",
      details:
        "The single # line is how a parser learns whose site this is. Without it the file " +
        "reads as a fragment rather than a directory.",
    });
  }
  if (!/^>\s+\S/m.test(body)) {
    issues.push("Missing blockquote with the one-sentence value prop.");
    findings.push({
      signature: "llms-txt.no_summary",
      title: "llms.txt has no one-line summary",
      severity: "low",
      category: "ai-visibility",
      details:
        "The blockquote is the sentence an assistant is most likely to repeat when asked " +
        "what this site is. Leaving it out means the model writes its own.",
    });
  }
  if (body.length > 2000) {
    issues.push(
      `File is ${body.length} chars — most parsers expect ≤ 2000.`,
    );
    findings.push({
      signature: "llms-txt.too_long",
      title: "llms.txt is longer than parsers expect",
      severity: "low",
      category: "ai-visibility",
      details:
        `The file is ${body.length} characters and most parsers expect 2000 or fewer. ` +
        "Anything past the limit may simply not be read.",
    });
  }
  if (body.length < 50) {
    issues.push("File looks too short — add a description and key links.");
    findings.push({
      signature: "llms-txt.too_short",
      title: "llms.txt is effectively empty",
      severity: "medium",
      category: "ai-visibility",
      details:
        "The file exists, which tells an assistant to read it, and then says nothing — " +
        "which is worse than not having one, because it looks deliberate.",
    });
  }

  const sectionCount = (body.match(/^##\s+/gm) ?? []).length;
  const linkCount = (body.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) ?? []).length;

  const result = {
    ok: true as const,
    present: true,
    content: body,
    issues,
    sectionCount,
    linkCount,
  };
  await recordToolRun({
    toolId: "llms-txt",
    label: `${llmsUrl} · ${issues.length} issues`,
    input: { url: rawUrl },
    result,
    findings,
  });
  return result;
}
