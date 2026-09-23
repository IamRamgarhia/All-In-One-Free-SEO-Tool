/**
 * Reading a product range out of a description.
 *
 * From a real client. The seed generator slid a two-word window over the
 * description after stripping punctuation and produced "tissue
 * polyester" — two words adjacent only because the comma between them
 * had been deleted. Fed to Google autocomplete that returns nothing
 * useful, so all twelve discovered keywords were wrong: retail "near me"
 * searches for a company that manufactures and exports.
 *
 * The risk in the fix is the opposite one. A confident wrong product
 * list is worse than the old behaviour, because it looks deliberate. So
 * most of these test that it declines.
 */

import { describe, expect, it } from "vitest";
import { expandProductList, looksB2B } from "./product-list";

const TAPES =
  "Indian manufacturer of BOPP, double-sided tissue, PTK®, polyester & kraft adhesive tapes. ISO 9001:2015, custom-slit 12–1200 mm, Delhi NCR. Since 1987.";

describe("expanding a real range", () => {
  it("gives every item the shared head noun", () => {
    const out = expandProductList(TAPES);
    expect(out).toContain("bopp adhesive tapes");
    expect(out).toContain("double-sided tissue adhesive tapes");
    expect(out).toContain("polyester adhesive tapes");
    expect(out).toContain("kraft adhesive tapes");
  });

  it("includes the head noun alone, which is the broadest term", () => {
    expect(expandProductList(TAPES)).toContain("adhesive tapes");
  });

  it("never produces the window-slid pairs that caused this", () => {
    // The exact strings the old extractor emitted.
    const out = expandProductList(TAPES);
    for (const junk of ["tissue polyester", "manufacturer bopp", "bopp double-sided"]) {
      expect(out, junk).not.toContain(junk);
    }
  });

  it("drops sentence punctuation", () => {
    // "kraft adhesive tapes." is not a search anybody performs.
    for (const p of expandProductList(TAPES)) {
      expect(p, p).not.toMatch(/[.,;:]$/);
    }
  });

  it("keeps credentials and geography out of the range", () => {
    // "iso adhesive tapes" and "delhi ncr adhesive tapes" both appeared
    // before the sentence was cut at the first full stop.
    const out = expandProductList(TAPES).join(" ");
    expect(out).not.toMatch(/\biso\b/);
    expect(out).not.toMatch(/delhi|ncr|1987/);
  });

  it("works on a different range with the same shape", () => {
    const out = expandProductList(
      "Supplier of stainless steel, brass, copper and aluminium fasteners.",
    );
    expect(out).toContain("stainless steel fasteners");
    expect(out).toContain("brass fasteners");
    expect(out).toContain("fasteners");
  });
});

describe("when it should say nothing", () => {
  it("declines prose that merely contains commas", () => {
    // "we sell shoes online" is grammatical and nobody types it.
    expect(expandProductList("We sell shoes, bags and belts online.")).toEqual([]);
  });

  it("declines a sentence about what the company does", () => {
    expect(
      expandProductList(
        "Dice Codes builds fast, SEO-friendly websites and online stores.",
      ),
    ).toEqual([]);
  });

  it("declines when there is no list at all", () => {
    expect(expandProductList("A bakery in Ludhiana.")).toEqual([]);
    expect(expandProductList("")).toEqual([]);
  });

  it("declines when the head noun is an adverb", () => {
    // "…and belts online" would otherwise make "online" the head and
    // produce "bags online", "belts online".
    expect(expandProductList("Shoes, bags, belts and hats online")).toEqual([]);
  });

  it("needs three items before calling it a range", () => {
    // Two is usually a sentence with an "and" in it.
    expect(expandProductList("Maker of tape and glue products")).toEqual([]);
  });
});

describe("telling B2B from retail", () => {
  it("reads the description, not the niche tag", () => {
    // The tag said "local". The description says manufacturer.
    expect(looksB2B(TAPES)).toBe(true);
  });

  it("recognises the words a trade supplier uses", () => {
    for (const w of [
      "We are a wholesale distributor",
      "OEM and ODM services",
      "Exporter of textiles",
      "Industrial fasteners in bulk",
    ]) {
      expect(looksB2B(w), w).toBe(true);
    }
  });

  it("does not call a local shop B2B", () => {
    // The consequence of a false positive here is losing "near me" from
    // a business whose customers genuinely search it.
    for (const w of [
      "A bakery in Ludhiana",
      "Family dentist serving the local area",
      "We sell handmade soap online",
    ]) {
      expect(looksB2B(w), w).toBe(false);
    }
  });

  it("treats a missing description as unknown, not B2B", () => {
    expect(looksB2B(null)).toBe(false);
    expect(looksB2B("")).toBe(false);
  });
});
