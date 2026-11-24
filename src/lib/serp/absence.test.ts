import { describe, expect, it } from "vitest";
import {
  absenceOf,
  describeAbsence,
  engineLabel,
  rankStatus,
  readingEngine,
  type AbsenceStrings,
} from "./absence";

const FR: AbsenceStrings = {
  gsc: "Aucune impression dans Search Console sur la période.",
  first: (count, engine) => `Absent des ${count} premiers résultats (${engine})`,
  read: (engine) => `Absent des résultats lus (${engine})`,
  engines: {
    searxng: "SearXNG",
    brave: "Brave Search",
    duckduckgo: "DuckDuckGo",
    google: "Google",
    unknown: "moteur non enregistré",
  },
};

const reading = (over: Partial<Parameters<typeof absenceOf>[0]> = {}) => ({
  position: null,
  source: "duckduckgo",
  engine: null,
  resultsScanned: 10,
  ...over,
});

describe("absenceOf", () => {
  it("is null when there is a position", () => {
    expect(absenceOf(reading({ position: 7 }))).toBeNull();
  });

  it("names the engine and the depth read", () => {
    const a = absenceOf(reading())!;
    expect(describeAbsence(a, FR, "fr")).toBe("Absent des 10 premiers résultats (DuckDuckGo)");
  });

  it("says 'results read' when the depth was not recorded", () => {
    const a = absenceOf(reading({ resultsScanned: null, source: "brave" }))!;
    expect(describeAbsence(a, FR, "fr")).toBe("Absent des résultats lus (Brave Search)");
  });

  it("speaks of impressions for Search Console", () => {
    expect(describeAbsence(absenceOf(reading({ source: "gsc" }))!, FR, "fr")).toBe(FR.gsc);
  });

  it("says when the engine was not recorded", () => {
    const a = absenceOf(reading({ source: "legacy", resultsScanned: 100 }))!;
    expect(describeAbsence(a, FR, "fr")).toBe("Absent des 100 premiers résultats (moteur non enregistré)");
  });
});

describe("engineLabel", () => {
  it("adds the SearXNG backend with French spacing in French only", () => {
    const e = readingEngine({ source: "searxng", engine: "google" });
    expect(engineLabel(e, FR.engines, "fr")).toBe("SearXNG : google");
    expect(engineLabel(e, FR.engines, "en")).toBe("SearXNG: google");
  });

  it("reads the results API and a Google engine as Google", () => {
    expect(readingEngine({ source: "api", engine: null }).id).toBe("google");
    expect(readingEngine({ source: "browser", engine: "google" }).id).toBe("google");
  });
});

describe("rankStatus", () => {
  const at = (d: string) => new Date(d);
  it("is never_checked with no reading and no failure", () => {
    expect(rankStatus(null, null)).toBe("never_checked");
  });

  it("is not_checked when the last attempt failed after the last reading", () => {
    const latest = { ...reading({ position: 4 }), checkedAt: at("2026-11-01") };
    expect(rankStatus(latest, at("2026-11-02"))).toBe("not_checked");
    expect(rankStatus(latest, at("2026-10-30"))).toBe("ranked");
  });

  it("is absent when the latest reading has no position", () => {
    expect(rankStatus({ ...reading(), checkedAt: at("2026-11-01") }, null)).toBe("absent");
  });
});
