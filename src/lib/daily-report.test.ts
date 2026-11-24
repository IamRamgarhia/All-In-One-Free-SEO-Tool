/**
 * Guards the stored nightly report: that it reads back only when it is
 * a real report, that its summary names failures, and that every job and
 * every note the sweep can write has a sentence in both languages — a
 * missing one would render a bare key, or fall back to "finished without
 * reporting anything" for a job that did report something.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  decodeSourceCounts,
  encodeSourceCounts,
  isStoredDailyReport,
  reasonParams,
  stepMessageKey,
  summariseDailyReport,
} from "./daily-report";

const agentSrc = readFileSync(join(process.cwd(), "src/lib/daily-agent.ts"), "utf8");

describe("summary for the scheduler note", () => {
  it("says all ok when nothing failed", () => {
    expect(
      summariseDailyReport({ steps: [{ name: "a", ok: true }, { name: "b", ok: true }] }),
    ).toBe("all 2 jobs ok");
  });

  it("names the failures rather than counting them", () => {
    expect(
      summariseDailyReport({
        steps: [
          { name: "rss.refresh", ok: true },
          { name: "rank.weekly_sweep", ok: false },
          { name: "sitemap.health", ok: false },
        ],
      }),
    ).toBe("1 of 3 jobs ok, 2 failed: rank.weekly_sweep, sitemap.health");
  });
});

describe("a stored report is read back only when it is one", () => {
  it("accepts the shape the sweep writes", () => {
    expect(
      isStoredDailyReport({
        at: "2026-11-24T03:00:00.000Z",
        durationMs: 1000,
        steps: [{ name: "rss.refresh", ok: true, note: { key: "feeds" }, durationMs: 10 }],
      }),
    ).toBe(true);
  });

  it("rejects anything else, so no report never reads as a report", () => {
    expect(isStoredDailyReport(null)).toBe(false);
    expect(isStoredDailyReport({ at: "x" })).toBe(false);
    expect(isStoredDailyReport({ at: "x", steps: [{ name: 1 }] })).toBe(false);
  });
});

describe("rank sources survive the flat params", () => {
  it("round-trips per-source counts and drops zeros", () => {
    const enc = encodeSourceCounts({ searxng: 3, duckduckgo: 2, gsc: 0 });
    expect(enc).toBe("searxng=3;duckduckgo=2");
    expect(decodeSourceCounts(enc)).toEqual([
      { source: "searxng", count: 3 },
      { source: "duckduckgo", count: 2 },
    ]);
    expect(decodeSourceCounts("")).toEqual([]);
  });
});

describe("reasons become select values", () => {
  it("maps the known ones and passes the rest through", () => {
    expect(reasonParams(undefined)).toEqual({ reason: "none", raw: "" });
    expect(reasonParams("not friday")).toEqual({ reason: "not_friday", raw: "" });
    expect(reasonParams("gmail scope not granted").reason).toBe("gmail_scope_not_granted");
    expect(reasonParams("403")).toEqual({ reason: "other", raw: "403" });
  });
});

describe("every job and every note has words in both languages", () => {
  const stepNames = [...agentSrc.matchAll(/runStep\(steps, "([^"]+)"/g)].map((m) => m[1]);
  const noteKeys = [...new Set([...agentSrc.matchAll(/note\("([A-Za-z]+)"/g)].map((m) => m[1]))];

  it("finds the jobs and notes in the sweep's source", () => {
    expect(stepNames.length).toBeGreaterThanOrEqual(20);
    expect(noteKeys.length).toBeGreaterThanOrEqual(20);
  });

  for (const [locale, messages] of [
    ["en", en],
    ["fr", fr],
  ] as const) {
    it(`names every job in ${locale}`, () => {
      const steps = (messages as unknown as { nightlyJobs: { steps: Record<string, string> } })
        .nightlyJobs.steps;
      for (const name of stepNames) {
        expect(steps[stepMessageKey(name)], name).toBeTruthy();
      }
    });

    it(`words every note in ${locale}`, () => {
      const notes = (messages as unknown as { nightlyJobs: { notes: Record<string, string> } })
        .nightlyJobs.notes;
      for (const key of noteKeys) expect(notes[key], key).toBeTruthy();
    });
  }

  it("renders notes with their reasons and sources", () => {
    const t = createTranslator({ locale: "fr", messages: fr, namespace: "nightlyJobs" }) as unknown as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    expect(t("notes.digests", { sent: 0, reason: "not_friday", raw: "" })).toBe(
      "Récapitulatifs envoyés : 0 (il part le vendredi).",
    );
    expect(t("notes.replies", { scanned: 0, matched: 0, reason: "other", raw: "403" })).toContain(
      "(réponse : 403)",
    );
    expect(
      t("notes.ranksAll", { checked: 8, sources: "SearXNG : 8", googleSkipped: "no" }),
    ).toBe("Mots-clés vérifiés : 8 (SearXNG : 8).");
    const tEn = createTranslator({ locale: "en", messages: en, namespace: "nightlyJobs" }) as unknown as (
      key: string,
      values?: Record<string, string | number>,
    ) => string;
    expect(tEn("notes.ranksNone", { total: 5, googleSkipped: "yes" })).toContain("Google blocked");
  });
});
