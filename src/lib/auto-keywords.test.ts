import { describe, expect, it } from "vitest";
import { brandSeeds, descriptorFor, servicePhrases } from "./auto-keywords";

/**
 * What we seed Google autocomplete with.
 *
 * A real client made this obvious. "Dice Codes" is a web agency in
 * Punjab; seeding autocomplete with its name returned sixty keywords
 * about the DICE ticketing app and Monopoly Go — "dice codes discount",
 * "dice discount code nhs", "dice codes for monopoly go". Every one was
 * about somebody else's business, and the onboarding flow offered to
 * track twelve of them from day one.
 *
 * Two causes, and the second is the instructive one:
 *
 *   - the brand name was a seed. A business that needs SEO help is by
 *     definition one nobody searches for by name, so autocomplete
 *     answers about whatever bigger thing shares those words.
 *
 *   - the description — the one field that says what the company does —
 *     was discarded. Bigrams had to appear TWICE to be kept, and the
 *     field asks for 1-3 sentences. Nothing repeats in three sentences.
 *
 * The client below is the real one, verbatim.
 */

const DICE = {
  clientName: "Dice Codes",
  domain: "dicecodes.com",
  niche: "services" as const,
  description:
    "Dice Codes builds fast, SEO-friendly websites and delivers SEO, e-commerce and digital marketing strategies that grow traffic and sales for businesses in Punjab and India.",
  city: "",
  country: "IN",
  businessTypeFromDesc: "software development",
  gscProperty: null,
  limit: 30,
};

describe("seeds describe the business, not its name", () => {
  it("never seeds on the brand name", () => {
    const seeds = brandSeeds(DICE).map((s) => s.toLowerCase());
    const brandy = seeds.filter((s) => s.includes("dice"));
    expect(
      brandy,
      `Seeding on the brand is what produced "dice codes for monopoly go". ` +
        `A small brand's name matches something bigger, and autocomplete ` +
        `answers about that instead.`,
    ).toEqual([]);
  });

  it("uses the stated business type", () => {
    // The user typed it into a field that asks for exactly this. Mining
    // it out of prose is what you do when nobody told you.
    expect(descriptorFor(DICE)).toBe("software development");
    expect(brandSeeds(DICE).some((s) => s.startsWith("software development"))).toBe(
      true,
    );
  });

  it("pulls service phrases out of the description", () => {
    const phrases = servicePhrases(DICE);
    expect(phrases).toContain("digital marketing");
    expect(phrases).toContain("seo-friendly websites");
  });

  it("drops the verbs the description is written with", () => {
    // "builds fast websites" is about the company. "fast websites" is a
    // thing someone searches for. The first version of this returned
    // "codes builds" and "websites delivers".
    const phrases = servicePhrases(DICE);
    for (const p of phrases) {
      expect(p, `"${p}" starts or ends on a verb`).not.toMatch(
        /\b(builds?|delivers?|grows?|helps?|provides?|offers?|creates?|makes?)\b/,
      );
    }
  });

  it("keeps the brand out of the description phrases too", () => {
    // The description almost always opens with the company name, so
    // without stripping it the very first phrase IS the brand and not
    // seeding on it achieves nothing.
    for (const p of servicePhrases(DICE)) {
      expect(p).not.toMatch(/dice|codes/);
    }
  });
});

describe("when there is nothing to go on", () => {
  const bare = {
    ...DICE,
    description: null,
    businessTypeFromDesc: undefined,
    niche: null,
  };

  it("returns no descriptor rather than guessing", () => {
    // A wrong subject seeds sixty wrong keywords. No subject just means
    // fewer seeds, and the caller falls back to the brand name — which
    // is a poor seed and better than an empty list.
    expect(descriptorFor(bare)).toBeNull();
    expect(servicePhrases(bare)).toEqual([]);
  });

  it("a description of only the brand name yields nothing", () => {
    expect(
      servicePhrases({ ...bare, description: "Dice Codes. Dice Codes!" }),
    ).toEqual([]);
  });
});
