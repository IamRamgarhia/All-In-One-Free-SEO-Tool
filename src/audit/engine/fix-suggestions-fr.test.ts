import { describe, expect, it } from "vitest";
import { FIX_SUGGESTIONS } from "./fix-suggestions";
import { FIX_SUGGESTIONS_FR } from "./fix-suggestions.fr";

describe("French fix suggestions", () => {
  it("cover every rule, and nothing else", () => {
    expect(Object.keys(FIX_SUGGESTIONS_FR).sort()).toEqual(Object.keys(FIX_SUGGESTIONS).sort());
  });

  it("are not left in English", () => {
    for (const [id, fr] of Object.entries(FIX_SUGGESTIONS_FR)) {
      expect(fr, id).not.toBe(FIX_SUGGESTIONS[id]);
      expect(fr, id).not.toMatch(/(^|[\s’])(tu|ton|ta|tes) /i);
    }
  });
});
