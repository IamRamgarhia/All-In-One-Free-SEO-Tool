/**
 * Suggesting competitors, tested on the logic rather than the network.
 *
 * Every competitor this had suggested across the install was wrong:
 * Walmart, Home Depot, Target, Staples and Lowe's for a tape manufacturer
 * in Delhi, and five coupon sites for a web agency. Each was named after
 * a product page title, and the note read "8 of 5 seed keywords" — a
 * count that could exceed the number of searches.
 */

import { describe, expect, it } from "vitest";
import {
  cleanSeed,
  isNotACompetitor,
  qualifySeeds,
  rankCompetitorDomains,
} from "./competitor-suggest";
import { duckDuckGoRegion } from "./link-prospector";

const r = (url: string, title = "A result") => ({ url, title });

describe("counting", () => {
  it("cannot report more searches than were run", () => {
    // The "8 of 5" bug: one domain listed several times in one search
    // used to count once per row.
    const ranked = rankCompetitorDomains({
      myDomain: "prateektapes.com",
      searches: [
        {
          query: "bopp tape manufacturer",
          results: [
            r("https://flexibondtapes.com/a"),
            r("https://flexibondtapes.com/b"),
            r("https://flexibondtapes.com/c"),
          ],
        },
        { query: "kraft paper tape manufacturer", results: [r("https://flexibondtapes.com/d")] },
      ],
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].queries).toBe(2);
    expect(ranked[0].queries).toBeLessThanOrEqual(2);
  });

  it("requires a domain to appear in at least two searches", () => {
    const ranked = rankCompetitorDomains({
      myDomain: "x.com",
      searches: [
        { query: "a", results: [r("https://once.com"), r("https://twice.com")] },
        { query: "b", results: [r("https://twice.com")] },
      ],
    });
    expect(ranked.map((c) => c.domain)).toEqual(["twice.com"]);
  });

  it("says which searches it matched", () => {
    const [c] = rankCompetitorDomains({
      myDomain: "x.com",
      searches: [
        { query: "bopp tape", results: [r("https://rival.in")] },
        { query: "kraft tape", results: [r("https://rival.in")] },
      ],
    });
    expect(c.matched).toEqual(["bopp tape", "kraft tape"]);
  });
});

describe("who is not a competitor", () => {
  it("excludes the retailers a tape manufacturer was given", () => {
    for (const d of ["walmart.com", "homedepot.com", "target.com", "staples.com", "lowes.com"]) {
      expect(isNotACompetitor(d), d).toBe(true);
    }
  });

  it("excludes the coupon sites an agency was given", () => {
    for (const d of [
      "simplycodes.com",
      "hotdeals.com",
      "top.coupert.com",
      "couponannie.com",
      "dealrated.com",
    ]) {
      expect(isNotACompetitor(d), d).toBe(true);
    }
  });

  it("excludes the learning platforms a live agency search returned", () => {
    // With the old junk gone, the rebuilt suggester's first live run for a
    // web agency still offered GeeksforGeeks and Coursera — sites that
    // rank for "mobile app development" and compete for nobody's project.
    for (const d of ["geeksforgeeks.org", "coursera.org", "www.udemy.com"]) {
      expect(isNotACompetitor(d), d).toBe(true);
    }
  });

  it("excludes directories found in the live Indian search, by subdomain too", () => {
    expect(isNotACompetitor("dir.indiamart.com")).toBe(true);
    expect(isNotACompetitor("exportersindia.com")).toBe(true);
  });

  it("excludes Amazon under any country domain", () => {
    for (const d of ["amazon.in", "amazon.co.uk", "www.amazon.de"]) {
      expect(isNotACompetitor(d), d).toBe(true);
    }
  });

  it("keeps real manufacturers, including ones containing a risky word", () => {
    // "deal" is not a rule, because idealtapes.com is a real tape maker.
    for (const d of ["flexibondtapes.com", "penguintapes.com", "idealtapes.com", "cellotapeinds.com"]) {
      expect(isNotACompetitor(d), d).toBe(false);
    }
  });

  it("never suggests the client's own site, subdomains included", () => {
    const ranked = rankCompetitorDomains({
      myDomain: "prateektapes.com",
      searches: [
        { query: "a", results: [r("https://www.prateektapes.com"), r("https://shop.prateektapes.com")] },
        { query: "b", results: [r("https://prateektapes.com/x")] },
      ],
    });
    expect(ranked).toEqual([]);
  });

  it("skips domains already on the client's list", () => {
    const ranked = rankCompetitorDomains({
      myDomain: "x.com",
      exclude: new Set(["rival.in"]),
      searches: [
        { query: "a", results: [r("https://www.rival.in")] },
        { query: "b", results: [r("https://rival.in")] },
      ],
    });
    expect(ranked).toEqual([]);
  });
});

describe("what gets searched", () => {
  const distinctive = new Set(["dice", "dicecodes"]);

  it("strips the retail modifiers that pointed searches at shops", () => {
    expect(cleanSeed("adhesive tape manufacturers near me", new Set())).toBe(
      "adhesive tape manufacturers",
    );
    expect(cleanSeed("adhesive tape shop near me", new Set())).toBe("adhesive tape");
  });

  it("refuses a seed containing the client's own name", () => {
    // Seeding on the brand is how an agency's competitors became coupon sites.
    expect(cleanSeed("dice codes discount", distinctive)).toBeNull();
  });

  it("refuses a seed with nothing left after cleaning", () => {
    expect(cleanSeed("near me shop", new Set())).toBeNull();
  });
});

describe("turning phrases into searches that find rivals", () => {
  it("adds manufacturer for a trade business, once", () => {
    expect(
      qualifySeeds({
        seeds: ["bopp packaging tapes", "kraft tape suppliers"],
        b2b: true,
        niche: "local",
        city: null,
      }),
    ).toEqual({ seeds: ["bopp packaging tapes manufacturer", "kraft tape suppliers"] });
  });

  it("lets a trade business off the city requirement", () => {
    // Prateek Tapes is tagged local but sells nationally and exports; its
    // rivals are not in Delhi, they are other manufacturers.
    const out = qualifySeeds({ seeds: ["kraft paper tapes"], b2b: true, niche: "local", city: null });
    expect("seeds" in out).toBe(true);
  });

  it("declines for a service business with no city, and says why", () => {
    // Live, a web agency's services searched with no location returned
    // Shopify, BigCommerce, Forbes, Hostinger and IBM. Nothing is better.
    const out = qualifySeeds({
      seeds: ["mobile app development", "digital marketing"],
      b2b: false,
      niche: "services",
      city: "",
    });
    expect("declined" in out).toBe(true);
    if ("declined" in out) expect(out.declined).toMatch(/city/i);
  });

  it("adds the city for a service business that has one", () => {
    expect(
      qualifySeeds({ seeds: ["digital marketing"], b2b: false, niche: "services", city: "Ludhiana" }),
    ).toEqual({ seeds: ["digital marketing ludhiana"] });
  });

  it("does not add a city that is already in the phrase", () => {
    expect(
      qualifySeeds({ seeds: ["bakery ludhiana"], b2b: false, niche: "local", city: "Ludhiana" }),
    ).toEqual({ seeds: ["bakery ludhiana"] });
  });

  it("searches other kinds of business as they stand", () => {
    expect(
      qualifySeeds({ seeds: ["project management software"], b2b: false, niche: "saas", city: null }),
    ).toEqual({ seeds: ["project management software"] });
  });
});

describe("searching in the right country", () => {
  it("maps India to the region that returned Indian manufacturers live", () => {
    expect(duckDuckGoRegion("IN")).toBe("in-en");
  });

  it("uses DuckDuckGo's spelling for the UK", () => {
    expect(duckDuckGoRegion("GB")).toBe("uk-en");
  });

  it("returns nothing for something that is not a country", () => {
    expect(duckDuckGoRegion("")).toBeUndefined();
    expect(duckDuckGoRegion(null)).toBeUndefined();
    expect(duckDuckGoRegion("India")).toBeUndefined();
  });
});
