import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import fr from "../../../messages/fr.json";
import en from "../../../messages/en.json";
import { describeRankFailure, describeRankFailures } from "./describe";
import { parseStoredFailures, RANK_ENGINES, type RankFailureCode } from "./failure";

/**
 * Every failure code must read as a sentence in both languages: a
 * missing message would put a raw key ("rankCheck.failure.truncated") on
 * the keyword list, which is what this replaced an English tooltip with.
 */

const CODES: RankFailureCode[] = [
  "blocked", "consent", "rateLimited", "unreadable", "truncated", "network", "http",
  "disabled", "browserMissing", "badConfig", "jsonDisabled", "noResults", "badKey",
  "skipped", "emptyDomain", "unknown",
];

const tFr = createTranslator({ locale: "fr", messages: fr, namespace: "rankCheck" });
const tEn = createTranslator({ locale: "en", messages: en, namespace: "rankCheck" });

describe("describeRankFailure", () => {
  it("words every code and engine in French and English", () => {
    for (const t of [tFr, tEn]) {
      for (const engine of RANK_ENGINES) {
        for (const code of CODES) {
          const text = describeRankFailure(t as never, { engine, code, status: 503, scanned: 20 });
          expect(text).not.toMatch(/rankCheck|failure\.|engine\./);
          expect(text.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("says how many results were read before a block", () => {
    expect(describeRankFailure(tFr as never, { engine: "google", code: "truncated", scanned: 20 })).toContain("20");
  });

  it("writes French with French typography", () => {
    const text = describeRankFailure(tFr as never, { engine: "duckduckgo", code: "blocked" });
    expect(text.startsWith("DuckDuckGo :")).toBe(true);
    expect(text).not.toContain("'");
  });

  it("leaves out the batch's own 'skipped' when a real cause is there", () => {
    const text = describeRankFailures(tEn as never, [
      { engine: "google", code: "skipped" },
      { engine: "duckduckgo", code: "blocked" },
    ]);
    expect(text).toContain("DuckDuckGo");
    expect(text).not.toContain("not asked");
  });
});

describe("parseStoredFailures", () => {
  it("reads back what the action stored", () => {
    const stored = JSON.stringify([{ engine: "google", code: "truncated", scanned: 20 }]);
    expect(parseStoredFailures(stored)).toEqual([{ engine: "google", code: "truncated", scanned: 20 }]);
  });

  it("drops junk instead of throwing", () => {
    expect(parseStoredFailures("not json")).toEqual([]);
    expect(parseStoredFailures(JSON.stringify([{ engine: "bing", code: "x" }, null, 5]))).toEqual([]);
  });
});
