import { describe, expect, it } from "vitest";
import {
  DATA_SOURCES,
  dataSourceDetail,
  dataSourceLabel,
  type DataSource,
} from "@/components/ui/data-source-badge";

/**
 * The copy on these badges is the only thing standing between a user and
 * treating an estimate as a measurement. An agency puts these numbers in
 * a client report, and "Google says 4,182 clicks" versus "we estimate
 * roughly 4,000 sessions" is the difference between a claim that holds
 * up and one that falls apart when the client checks.
 *
 * So the tests are about honesty, not rendering: does every source admit
 * its own limitation?
 */

describe("data source vocabulary", () => {
  it("every source has a label and a real explanation", () => {
    for (const s of DATA_SOURCES) {
      expect(dataSourceLabel(s).length, s).toBeGreaterThan(2);
      // Long enough to actually say something. A three-word tooltip is
      // decoration.
      expect(dataSourceDetail(s).length, s).toBeGreaterThan(40);
    }
  });

  it("every source states a limitation, not just a provenance", () => {
    // The point of the badge is calibration. "From Search Console" alone
    // tells a user where it came from but not how much to trust it.
    const hedges =
      /lag|only|under-?count|may |can |assum|not measur|hasn't|expect|differ|worth reading|which may/i;
    for (const s of DATA_SOURCES) {
      expect(dataSourceDetail(s), `${s} does not admit any limitation`).toMatch(
        hedges,
      );
    }
  });

  it("marks the two sources that must never be read as measured", () => {
    // These are the ones that cause real damage when mistaken for fact:
    // a number we derived, and text a model wrote.
    expect(dataSourceDetail("estimate")).toMatch(/not measured/i);
    expect(dataSourceDetail("estimate")).toMatch(/client report/i);
    expect(dataSourceDetail("ai")).toMatch(/before it goes to a client/i);
  });

  it("says Search Console lags, because people forget", () => {
    // The single most common support question for any rank tracker is
    // "why doesn't this match what I see in Google right now".
    expect(dataSourceDetail("gsc")).toMatch(/two to three days/i);
  });

  it("does not claim analytics is complete", () => {
    expect(dataSourceDetail("ga4")).toMatch(/ad blocker|consent|under-?count/i);
  });

  it("returns something usable for an unknown source rather than blank", () => {
    const bogus = "not-a-source" as DataSource;
    expect(dataSourceLabel(bogus)).toBe("not-a-source");
    expect(dataSourceDetail(bogus)).toBe("");
  });

  it("has no duplicate labels", () => {
    // Two sources sharing a label would make the badge meaningless in
    // exactly the situation it exists for — telling two numbers apart.
    const labels = DATA_SOURCES.map(dataSourceLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
