import { describe, expect, it } from "vitest";
import { ISSUE_EXPLAINERS, localizeExplainer } from "./issue-explainers";
import { ISSUE_EXPLAINERS_FR } from "./issue-explainers.fr";

describe("French explainers", () => {
  it("cover every explainer, with the same number of steps", () => {
    for (const [type, en] of Object.entries(ISSUE_EXPLAINERS)) {
      const fr = ISSUE_EXPLAINERS_FR[type];
      expect(fr, type).toBeDefined();
      expect(fr.howToFix.length, type).toBe(en.howToFix.length);
    }
  });

  it("replace the prose and keep the links", () => {
    const en = ISSUE_EXPLAINERS.missing_title;
    const fr = localizeExplainer(en, "missing_title", "fr");
    expect(fr.whatIsIt).not.toBe(en.whatIsIt);
    expect(fr.googleDoc).toBe(en.googleDoc);
    expect(localizeExplainer(en, "missing_title", "en")).toBe(en);
  });

  it("never address the reader as « tu »", () => {
    for (const [type, fr] of Object.entries(ISSUE_EXPLAINERS_FR)) {
      for (const text of [fr.whatIsIt, fr.whyItMatters, ...fr.howToFix]) {
        expect(text, type).not.toMatch(/(^|[\s’'])(tu|ton|ta|tes) /i);
      }
    }
  });
});
