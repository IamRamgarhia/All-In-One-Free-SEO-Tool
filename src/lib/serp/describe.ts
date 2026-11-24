/**
 * Turn a rank failure into a sentence in the reader's language.
 *
 * Shared by the server action (which answers a click) and the keyword
 * page (which shows the last failure from the history), so both say the
 * same thing in the same words. Messages live under `rankCheck` in
 * messages/{fr,en}.json.
 */

import type { RankEngine, RankFailure } from "./failure";
import { significantFailures } from "./failure";

/** The subset of a next-intl translator this needs. */
export type RankTx = (key: string, values?: Record<string, string | number>) => string;

export function rankEngineName(t: RankTx, engine: RankEngine): string {
  return t(`engine.${engine}`);
}

export function describeRankFailure(t: RankTx, f: RankFailure): string {
  return t(`failure.${f.code}`, {
    engine: rankEngineName(t, f.engine),
    status: f.status ?? 0,
    scanned: f.scanned ?? 0,
  });
}

/** Every significant failure, one sentence each. */
export function describeRankFailures(t: RankTx, failures: readonly RankFailure[]): string {
  const list = significantFailures(failures);
  if (list.length === 0) return t("failure.unknown", { engine: t("engine.google") });
  return list.map((f) => describeRankFailure(t, f)).join(" ");
}
