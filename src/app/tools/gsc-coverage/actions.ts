"use server";

import { inspectGscUrl, type UrlInspection } from "@/lib/google-oauth";
import { saveToolRun } from "@/lib/tool-runs";
import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";

export type CoverageState =
  | { ok: true; site: string; rows: UrlInspection[]; summary: Record<string, number>; aiFailure?: AiFailure | null }
  | { ok: false; error: string };

const CONCURRENCY = 4;

export async function runCoverage(
  _prev: CoverageState | null,
  formData: FormData,
): Promise<CoverageState> {
  const site = String(formData.get("site") ?? "").trim();
  const urlsRaw = String(formData.get("urls") ?? "").trim();
  if (!site) return { ok: false, error: "Pick a GSC property." };
  if (!urlsRaw) return { ok: false, error: "Paste at least one URL." };

  const urls = Array.from(
    new Set(
      urlsRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 60);

  // GSC URL Inspection: 2000 calls per day per property — per Google's quota.
  // We rate-limit to 4 concurrent + ~250ms between launches to be polite.
  const rows: UrlInspection[] = [];
  const queue = urls.slice();

  async function worker() {
    while (queue.length > 0) {
      const u = queue.shift();
      if (!u) return;
      try {
        const r = await inspectGscUrl({
          siteUrl: site,
          inspectionUrl: u,
        });
        rows.push(r);
      } catch (err) {
        rows.push({
          url: u,
          indexingState: null,
          verdict: null,
          crawledAs: null,
          lastCrawlTime: null,
          pageFetchState: null,
          robotsTxtState: null,
          coverageState: null,
          coverageStateReason: null,
          referringUrls: [],
          sitemap: [],
          error: (err as Error).message,
        });
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

  const summary: Record<string, number> = {};
  for (const r of rows) {
    const k = r.coverageState ?? r.verdict ?? "Unknown";
    summary[k] = (summary[k] ?? 0) + 1;
  }

  await saveToolRun({
    toolId: "gsc-coverage",
    label: `${site} · ${rows.length} URLs`,
    input: { site, urlCount: urls.length },
    result: { ok: true, site, rows, summary },
  }).catch(() => undefined);
  return { ok: true, site, rows, summary, aiFailure: lastAiFailure() };
}

// ────────────────────────────────────────────────────────────────────
// AI fix analysis — given a set of inspection rows, ask the AI to
// produce concrete fix steps per URL. Returns a structured plan so
// the UI can render it inline next to each row.
// ────────────────────────────────────────────────────────────────────

export type FixPlanItem = {
  url: string;
  cause: string;
  /** 1-3 concrete fix steps the user can do. */
  steps: string[];
  /** What we'd auto-apply if the WordPress bridge were connected. */
  autoApply?:
    | { kind: "remove_noindex"; postHint: string }
    | { kind: "set_canonical"; canonical: string; postHint: string }
    | { kind: "submit_indexnow"; reason: string }
    | { kind: "needs_content"; topic: string };
};

export type FixPlanState =
  | { ok: true; items: FixPlanItem[]; aiFailure?: AiFailure | null }
  | { ok: false; error: string }
  | null;

/**
 * Analyze the rows that aren't successfully indexed and ask the AI
 * to draft a fix plan per URL. Caps at 30 URLs per run so a coverage
 * run of 60 URLs still fits within reasonable AI cost.
 *
 * The AI returns structured JSON; permanent failures (indexed pages,
 * empty results) are filtered server-side so we don't burn tokens
 * asking "how do I fix this fine URL?".
 */
export async function analyzeFixesForCoverage(
  _prev: FixPlanState,
  formData: FormData,
): Promise<FixPlanState> {
  const rowsRaw = String(formData.get("rows") ?? "");
  let rows: UrlInspection[] = [];
  try {
    rows = JSON.parse(rowsRaw);
  } catch {
    return { ok: false, error: "Couldn't parse the inspection rows." };
  }
  // Only ask the AI about URLs that actually have a problem
  const needsFix = rows.filter((r) => {
    if (r.error) return true;
    if (r.verdict === "PASS") return false;
    const state = (r.coverageState ?? "").toLowerCase();
    return (
      state.includes("not indexed") ||
      state.includes("excluded") ||
      state.includes("error") ||
      state.includes("blocked") ||
      state.includes("redirect") ||
      r.indexingState === "BLOCKED_BY_ROBOTS_TXT" ||
      r.indexingState === "BLOCKED_BY_META_TAG" ||
      r.indexingState === "BLOCKED_BY_HTTP_HEADER"
    );
  });
  if (needsFix.length === 0) {
    return { ok: true, items: [], aiFailure: lastAiFailure() };
  }
  const batch = needsFix.slice(0, 30);

  const compact = batch.map((r) => ({
    url: r.url,
    coverageState: r.coverageState,
    coverageStateReason: r.coverageStateReason,
    indexingState: r.indexingState,
    pageFetchState: r.pageFetchState,
    robotsTxtState: r.robotsTxtState,
    crawledAs: r.crawledAs,
    error: r.error,
  }));

  const system = `You're an SEO technical lead. For each URL below, return concrete fix steps. Output STRICT JSON only — no markdown fences, no preamble.

Schema:
{ "items": [
  {
    "url": "<exact URL>",
    "cause": "Single sentence — why Google isn't indexing this.",
    "steps": ["Step 1", "Step 2", ...],   // 1-3 specific actions
    "autoApply": {
      "kind": "remove_noindex" | "set_canonical" | "submit_indexnow" | "needs_content",
      ...kind-specific fields
    } | null
  }
]}

autoApply kinds:
  remove_noindex → { kind, postHint: "Locate the WP post for <slug>" }
    Use when reason is BLOCKED_BY_META_TAG or 'Excluded by 'noindex' tag'.
  set_canonical → { kind, canonical: "<URL>", postHint: "..." }
    Use when reason is 'Duplicate' or 'Google chose different canonical'.
  submit_indexnow → { kind, reason: "<1-line>" }
    Use when state is 'Discovered - currently not indexed' (page is fine,
    needs a poke).
  needs_content → { kind, topic: "<topic guess>" }
    Use when state is 'Crawled - currently not indexed' on a URL that
    suggests thin or duplicate content.
  null → when fix requires hosting/server intervention (5xx, robots.txt).

Be specific. Don't say "improve content" — say "add 400+ words of unique
analysis, internal-link to /pillar-page, target a long-tail keyword".`;

  const user = `Inspection rows:\n${JSON.stringify(compact, null, 2)}`;

  const raw = await callAI({
    system,
    user,
    maxTokens: 3500,
    temperature: 0.3,
    timeoutMs: 120_000,
    feature: "general",
    ignoreCreditSaver: true,
  });
  if (!raw) {
    return {
      ok: false,
      error:
        "AI didn't respond. Check Settings → AI provider, or retry — the global semaphore may have queued behind a daily-agent task.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: { items?: FixPlanItem[] } | null = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed?.items) {
    return {
      ok: false,
      error: "AI response wasn't valid JSON. Try again.",
    };
  }
  return { ok: true, items: parsed.items.slice(0, 30), aiFailure: lastAiFailure() };
}

