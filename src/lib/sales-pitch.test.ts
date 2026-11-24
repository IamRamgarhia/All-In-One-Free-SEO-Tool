import { describe, expect, it } from "vitest";
import { buildPitch } from "./sales-pitch";

const findings = [
  { type: "long_title", severity: "low", message: "Title is 62 characters — Google may truncate beyond ~60." },
  { type: "missing_meta_description", severity: "medium", message: "Missing meta description." },
  { type: "no_https", severity: "critical", message: "Page is not served over HTTPS." },
  { type: "missing_h1", severity: "high", message: "No <h1> heading on the page." },
  { type: "missing_h1", severity: "high", message: "No <h1> heading on the page." },
  { type: "slow_response", severity: "medium", message: "Server responded in 1200ms — aim for under 800ms." },
];

describe("the pre-sale page", () => {
  it("keeps the three most serious problems, once each, in French", () => {
    const p = buildPitch(findings, "fr");
    expect(p.problems.map((x) => x.type)).toEqual(["no_https", "missing_h1", "missing_meta_description"]);
    expect(p.problems[0].name).toBe("Site sans HTTPS");
    expect(p.problems[0].detail).toBe("La page n’est pas servie en HTTPS.");
    expect(p.problems[0].action).toBe("Activer le HTTPS et corriger le contenu mixte");
  });

  it("offers quick wins that are not already listed as problems", () => {
    const p = buildPitch(findings, "fr");
    expect(p.quickWins.map((x) => x.type)).toEqual(["long_title"]);
  });

  it("never lists a low-severity tidy-up as a problem", () => {
    const p = buildPitch([findings[0]], "fr");
    expect(p.problems).toEqual([]);
  });
});
