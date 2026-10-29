import { describe, expect, it } from "vitest";
import {
  EXAMPLE_DOMAIN,
  isOwnBrand,
  mentionsExampleBrand,
  scrubExampleBrand,
} from "./example-brand-guard";

describe("example brand guard", () => {
  describe("detection", () => {
    it("finds the brand however it is spaced or cased", () => {
      for (const t of [
        "Home - Dice Codes",
        "home | dice codes",
        "DICE CODES",
        "DiceCodes",
        "see dicecodes.com for more",
      ]) {
        expect(mentionsExampleBrand(t)).toBe(true);
      }
    });

    it("leaves unrelated text alone", () => {
      for (const t of ["", "Loaded dice and card codes", "Dice Roller Pro"]) {
        expect(mentionsExampleBrand(t)).toBe(false);
      }
    });
  });

  describe("the client who really is that company", () => {
    it("recognises its own domain and name", () => {
      expect(isOwnBrand({ url: "https://dicecodes.com" })).toBe(true);
      expect(isOwnBrand({ url: "https://www.dicecodes.com/services" })).toBe(
        true,
      );
      expect(isOwnBrand({ url: "dicecodes.com" })).toBe(true);
      expect(isOwnBrand({ name: "Dice Codes" })).toBe(true);
    });

    it("is not fooled by a host that merely contains the domain", () => {
      // A substring test on the URL would have said yes to all of these,
      // which is how a guard like this leaks the exact thing it guards.
      expect(isOwnBrand({ url: "https://dicecodes.com.evil.test" })).toBe(
        false,
      );
      expect(isOwnBrand({ url: "https://notdicecodes.com" })).toBe(false);
      expect(isOwnBrand({ url: "https://example.com/dicecodes.com" })).toBe(
        false,
      );
      expect(isOwnBrand({ url: "" })).toBe(false);
      expect(isOwnBrand({ url: "not a url at all" })).toBe(false);
      expect(isOwnBrand({})).toBe(false);
    });

    it("passes that client's own text through untouched", () => {
      const own = "Dice Codes — Web Design in Ludhiana";
      expect(scrubExampleBrand(own, { ownBrand: true })).toEqual({
        text: own,
        removed: 0,
      });
    });
  });

  describe("stripping", () => {
    it("closes the gap instead of leaving dangling separators", () => {
      // The naive replace leaves "Home - ", " |  | ", or "- Free Shipping",
      // which is a worse suggestion than the leak it fixed.
      const cases: [string, string][] = [
        ["Home - Dice Codes", "Home"],
        ["Dice Codes - Home", "Home"],
        [
          "Sustainable Coffee Subscriptions | Dice Codes — Free Shipping",
          "Sustainable Coffee Subscriptions - Free Shipping",
        ],
        [
          "Best espresso machines under $500 (2026 tested) — Dice Codes",
          "Best espresso machines under $500 (2026 tested)",
        ],
        ["Visit dicecodes.com today", "Visit today"],
        ["About Dice Codes.", "About."],
      ];
      for (const [input, expected] of cases) {
        expect(scrubExampleBrand(input).text).toBe(expected);
      }
    });

    it("reports how many mentions it took out", () => {
      expect(scrubExampleBrand("Dice Codes and Dice Codes").removed).toBe(2);
      expect(scrubExampleBrand(`Dice Codes at ${EXAMPLE_DOMAIN}`).removed).toBe(
        2,
      );
      expect(scrubExampleBrand("nothing here").removed).toBe(0);
    });

    it("never leaves the brand behind", () => {
      const inputs = [
        "Home - Dice Codes",
        "dice codes | Home",
        "DICECODES.COM",
        "A, Dice Codes, B",
        "Dice Codes",
        "Buy from DiceCodes now",
      ];
      for (const input of inputs) {
        const { text } = scrubExampleBrand(input);
        expect(mentionsExampleBrand(text), `left a mention in ${input}`).toBe(
          false,
        );
      }
    });

    it("returns text with no mention byte-identical", () => {
      // Otherwise every AI response in the app gets quietly reformatted
      // by a function that was only supposed to handle a rare case.
      const untouched = [
        "Best espresso machines under $500 (2026 tested) — Acme Roasters",
        "  leading and trailing space preserved  ",
        "A - B | C",
        "Multi\nline\n\ntext with  double  spaces",
      ];
      for (const t of untouched) {
        expect(scrubExampleBrand(t)).toEqual({ text: t, removed: 0 });
      }
    });

    it("handles empty and whitespace input without throwing", () => {
      expect(scrubExampleBrand("")).toEqual({ text: "", removed: 0 });
      expect(scrubExampleBrand("   ")).toEqual({ text: "   ", removed: 0 });
    });
  });
});
