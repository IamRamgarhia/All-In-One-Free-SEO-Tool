/**
 * Reading the last nightly sweep's result, without importing the sweep.
 *
 * Ported from upstream (feat(automation): keep the nightly sweep's
 * result, which was being thrown away). The sweep runs about twenty jobs
 * every night, each returning whether it worked and what it found, and
 * all of it was discarded: only a timestamp was stored. An install where
 * every job failed looked exactly like one where none did.
 *
 * WHY SEPARATE: daily-agent.ts reaches every job it runs — audits, the
 * AI suggestion pass, rank checks, the browser pool. A page that only
 * wants to DISPLAY what happened would pull all of that into its import
 * graph, and the capability table would flip /settings/health to
 * `needsAI: required, usesBrowser: true`. This module touches only the
 * settings store (same split as sweep-failures.ts and trial-shared.ts).
 *
 * BILINGUAL: a job does not write a sentence, it writes a note — a key
 * and the numbers the sentence is built from. The sentences live in
 * messages/*.json under `nightlyJobs.notes`, so a stored report reads in
 * the viewer's language, not the scheduler's. Only a failure keeps the
 * raw error text, verbatim, because that is the outside world's answer.
 */

import { getSetting } from "./settings-store";

/** What a job found, as a message key plus the values it is built from. */
export type StepNote = {
  key: string;
  params?: Record<string, string | number>;
};

export type StoredDailyStep = {
  name: string;
  ok: boolean;
  /** Set when the job succeeded and said what it did. */
  note?: StepNote;
  /** The raw error, verbatim, when the job failed. */
  error?: string;
  durationMs: number;
};

/**
 * What the last nightly sweep did, as stored.
 *
 * Kept rather than recomputed because the sweep runs once a day and
 * takes minutes; a page cannot re-run it to find out how it went.
 */
export type StoredDailyReport = {
  at: string;
  durationMs: number;
  steps: StoredDailyStep[];
};

export const DAILY_REPORT_KEY = "daily_agent.last_report" as const;

/** The stored report, or null when no sweep has finished yet. */
export async function readDailyReport(): Promise<StoredDailyReport | null> {
  const raw = await getSetting<StoredDailyReport>(DAILY_REPORT_KEY).catch(
    () => null,
  );
  return isStoredDailyReport(raw) ? raw : null;
}

export function isStoredDailyReport(raw: unknown): raw is StoredDailyReport {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<StoredDailyReport>;
  return (
    typeof r.at === "string" &&
    Array.isArray(r.steps) &&
    r.steps.every(
      (s) => s && typeof s.name === "string" && typeof s.ok === "boolean",
    )
  );
}

/**
 * "18 of 22 jobs ok, 4 failed: rank.weekly_sweep, …" — for the
 * scheduler's own note, which is English like every other runner's.
 *
 * Names the failures rather than counting them: "4 failed" sends someone
 * looking; the names tell them where.
 */
export function summariseDailyReport(r: {
  steps: { name: string; ok: boolean }[];
}): string {
  const failed = r.steps.filter((s) => !s.ok);
  const ok = r.steps.length - failed.length;
  if (failed.length === 0) return `all ${r.steps.length} jobs ok`;
  return (
    `${ok} of ${r.steps.length} jobs ok, ${failed.length} failed: ` +
    failed.map((s) => s.name).join(", ")
  );
}

/**
 * A step name as a message key. Step names use dots ("rank.weekly_sweep"),
 * which next-intl would read as nesting.
 */
export function stepMessageKey(name: string): string {
  return name.replace(/\./g, "_");
}

/**
 * Per-source counts for the rank sweep, stored as "searxng=3;duckduckgo=2"
 * so a note's params stay flat; the surface names each source in the
 * viewer's language.
 */
export function encodeSourceCounts(
  bySource: Partial<Record<string, number>>,
): string {
  return Object.entries(bySource)
    .filter(([, n]) => typeof n === "number" && n > 0)
    .map(([id, n]) => `${id}=${n}`)
    .join(";");
}

export function decodeSourceCounts(
  encoded: string,
): { source: string; count: number }[] {
  if (!encoded) return [];
  return encoded
    .split(";")
    .map((part) => {
      const [source, n] = part.split("=");
      return { source, count: Number(n) };
    })
    .filter((x) => x.source && Number.isFinite(x.count));
}

/**
 * The reasons a job gives for doing nothing, as a select value the
 * messages can translate. Anything else is passed through as `raw`.
 */
const KNOWN_REASONS = new Set([
  "throttled",
  "not_friday",
  "no_smtp",
  "no_recipient",
  "no_mentions",
  "no_google",
  "gmail_unreachable",
  "gmail_scope_not_granted",
  "no_contacted_prospects",
]);

export function reasonParams(reason: string | undefined): {
  reason: string;
  raw: string;
} {
  if (!reason) return { reason: "none", raw: "" };
  const slug = reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return KNOWN_REASONS.has(slug)
    ? { reason: slug, raw: "" }
    : { reason: "other", raw: reason.slice(0, 120) };
}
