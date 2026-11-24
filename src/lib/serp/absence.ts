/**
 * What an empty position means, said the same way everywhere.
 *
 * A reading with no position is not "not ranked": DuckDuckGo reads about
 * ten results, Google up to a hundred, Search Console only knows about
 * impressions. So an empty position is always said as "absent from the
 * first N results (engine)", "absent from the results read (engine)" or
 * "no Search Console impressions", and a failed check as "not checked".
 *
 * This file only works out the facts; each surface words them with its
 * own strings (messages/*.json for pages and the CSV, report-i18n for the
 * PDF), so a page, a report and an export never disagree.
 */

/** The fields of a `keyword_rankings` row this needs. */
export type RankReadingLike = {
  position: number | null;
  source: string | null;
  engine: string | null;
  resultsScanned: number | null;
};

export type ReadingEngine =
  | { id: "searxng"; detail: string | null }
  | { id: "brave" | "duckduckgo" | "google" | "unknown"; detail: null };

/** The engine whose results were read. */
export function readingEngine(r: Pick<RankReadingLike, "source" | "engine">): ReadingEngine {
  if (r.source === "searxng") return { id: "searxng", detail: r.engine || null };
  if (r.source === "brave") return { id: "brave", detail: null };
  if (r.source === "duckduckgo") return { id: "duckduckgo", detail: null };
  if (r.source === "api" || r.engine === "google") return { id: "google", detail: null };
  return { id: "unknown", detail: null };
}

export type Absence =
  | { kind: "gsc" }
  | { kind: "first"; count: number; engine: ReadingEngine }
  | { kind: "read"; engine: ReadingEngine };

/** Why a reading has no position. Null when it has one. */
export function absenceOf(r: RankReadingLike): Absence | null {
  if (r.position !== null) return null;
  if (r.source === "gsc") return { kind: "gsc" };
  const engine = readingEngine(r);
  return r.resultsScanned && r.resultsScanned > 0
    ? { kind: "first", count: r.resultsScanned, engine }
    : { kind: "read", engine };
}

/** Names of the engines in one language. */
export type EngineNames = Record<"searxng" | "brave" | "duckduckgo" | "google" | "unknown", string>;

/** "SearXNG : google" in French, "SearXNG: google" in English. */
export function engineLabel(e: ReadingEngine, names: EngineNames, locale: string): string {
  const name = names[e.id];
  if (e.id === "searxng" && e.detail) return `${name}${locale === "fr" ? " : " : ": "}${e.detail}`;
  return name;
}

/** Strings to word an absence, from whichever catalogue the surface uses. */
export type AbsenceStrings = {
  gsc: string;
  first: (count: number, engine: string) => string;
  read: (engine: string) => string;
  engines: EngineNames;
};

export function describeAbsence(a: Absence, s: AbsenceStrings, locale: string): string {
  if (a.kind === "gsc") return s.gsc;
  const engine = engineLabel(a.engine, s.engines, locale);
  return a.kind === "first" ? s.first(a.count, engine) : s.read(engine);
}

/** The subset of a next-intl translator these strings need. */
type Tx = (key: string, values?: Record<string, string | number>) => string;

/**
 * The strings from messages/*.json: `keywords.*` for the sentences and
 * `rankCheck.engine.*` for the engine names.
 */
export function absenceStringsFromMessages(tKeywords: Tx, tRankCheck: Tx): AbsenceStrings {
  return {
    gsc: tKeywords("absentGsc"),
    first: (count, engine) => tKeywords("absentFromFirst", { count, engine }),
    read: (engine) => tKeywords("absentFromRead", { engine }),
    engines: {
      searxng: tRankCheck("engine.searxng"),
      brave: tRankCheck("engine.brave"),
      duckduckgo: tRankCheck("engine.duckduckgo"),
      google: tRankCheck("engine.google"),
      unknown: tKeywords("engineUnknown"),
    },
  };
}

/** Machine status of a keyword's latest check, for the API and the CSV. */
export type RankStatus = "ranked" | "absent" | "not_checked" | "never_checked";

/**
 * "not_checked" when the last attempt failed after the last reading:
 * showing that older reading as today's would be wrong.
 */
export function rankStatus(
  latest: (RankReadingLike & { checkedAt: Date }) | null | undefined,
  lastFailureAt: Date | null | undefined,
): RankStatus {
  if (lastFailureAt && (!latest || lastFailureAt.getTime() > latest.checkedAt.getTime())) {
    return "not_checked";
  }
  if (!latest) return "never_checked";
  return latest.position === null ? "absent" : "ranked";
}
