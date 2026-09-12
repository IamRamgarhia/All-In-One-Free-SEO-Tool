/**
 * Reading a site instead of guessing at it.
 *
 * The bug this replaces: discovery seeded itself from `<meta
 * name="description">` alone. When that tag happened to list the product
 * range the keywords were excellent, and the good result hid the fact
 * that nothing else was being read. A vague description produced
 * "welcome website near me". A missing one produced nothing.
 *
 * The risk in the replacement is the same one the product-list reader
 * has: a confident wrong vocabulary is worse than an empty one, because
 * it looks deliberate and nobody re-checks it. So roughly half of these
 * test that it declines — chrome, headlines, brand words, prose.
 */

import { describe, expect, it } from "vitest";
import {
  brandFilterFor,
  isWorthReading,
  navTerms,
  normaliseTerm,
  rankPages,
  readSiteVocabulary,
  schemaProductTerms,
  vocabularySeeds,
} from "./site-vocabulary";

const BRAND = brandFilterFor("Prateek Tapes", "https://prateektapes.com");

const HOME = `<!doctype html>
<html><head>
<title>Prateek Tapes | Adhesive Tape Manufacturer in Delhi NCR</title>
<meta name="description" content="Quality products since 1987.">
</head>
<body>
<header>
  <a href="/"><img src="/logo.png" alt="Prateek Tapes"></a>
  <nav>
    <a href="/">Home</a>
    <a href="/products/bopp-tapes">BOPP Tapes</a>
    <a href="/products/double-sided-tissue-tapes">Double Sided Tissue Tapes</a>
    <a href="/products/polyester-tapes">Polyester Tapes</a>
    <a href="/products/kraft-paper-tapes">Kraft Paper Tapes</a>
    <a href="/about">About Us</a>
    <a href="/contact">Contact Us</a>
    <a href="/cart">Cart</a>
    <a href="https://facebook.com/prateektapes">Follow us</a>
  </nav>
</header>
<main>
  <h1>We deliver quality you can trust</h1>
  <h2>BOPP Tapes</h2>
  <h2>Polyester Tapes</h2>
  <h3>Read more</h3>
  <a href="/blog/2024/packaging-trends">Packaging trends 2024</a>
  <a href="/brochure.pdf">Download</a>
</main>
</body></html>`;

const PRODUCT_PAGE = `<html><head>
<title>BOPP Tapes - Prateek Tapes</title></head>
<body>
<h1>BOPP Tapes</h1>
<h2>Custom slit widths</h2>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"BOPP Adhesive Tape","brand":{"@type":"Brand","name":"Prateek Tapes"}}
</script>
</body></html>`;

function siteOf(pages: Record<string, string>) {
  return async (url: string) => {
    const path = new URL(url).pathname;
    const html = pages[path];
    return html ? { url, html } : null;
  };
}

describe("normalising a term", () => {
  it("keeps a product name", () => {
    expect(normaliseTerm("BOPP Tapes", BRAND)).toBe("bopp tapes");
  });

  it("drops navigation chrome", () => {
    // These are in the nav of every site on earth and name nothing.
    for (const c of ["Home", "Contact Us", "Privacy Policy", "Read more", "Follow us"]) {
      expect(normaliseTerm(c, BRAND), c).toBeNull();
    }
  });

  it("drops a headline, which is a sentence and not a thing", () => {
    // Real h1 from the fixture. Seeded, it returns nothing useful.
    expect(normaliseTerm("We deliver quality you can trust", BRAND)).toBeNull();
    expect(normaliseTerm("Why choose our leading service", BRAND)).toBeNull();
  });

  it("drops a term that is only the brand", () => {
    expect(normaliseTerm("Prateek Tapes", BRAND)).toBeNull();
  });

  it("strips the brand off the edges rather than dropping the term", () => {
    // "prateek tapes bopp tape" is nobody's search. "bopp tape" is.
    expect(normaliseTerm("Prateek Tapes BOPP Tape", BRAND)).toBe("bopp tape");
  });

  it("drops strings with no letters", () => {
    expect(normaliseTerm("+91 98110 12345", BRAND)).toBeNull();
    expect(normaliseTerm("1987", BRAND)).toBeNull();
  });

  it("drops a model code", () => {
    // Found by running this against the real site. It gives every model
    // its own page with Product schema on it, so "ptk 700" through "ptk
    // 1200" came out as the six most confident terms on the whole
    // domain and pushed the actual product range out of the seed list.
    // Confident because the site really does say them; useless because
    // nobody searches them.
    for (const sku of ["PTK 700", "PTK 1200", "Series 900"]) {
      expect(normaliseTerm(sku, BRAND), sku).toBeNull();
    }
  });

  it("keeps a measurement, whose digits are attached to a unit", () => {
    // The rule above must not eat "48mm bopp tape", which is a real
    // search a buyer performs.
    expect(normaliseTerm("48mm BOPP Tape", BRAND)).toBe("48mm bopp tape");
  });

  it("drops a sentence", () => {
    expect(
      normaliseTerm("Six decades of manufacturing excellence across India today", BRAND),
    ).toBeNull();
  });

  it("strips trailing punctuation and branding marks", () => {
    expect(normaliseTerm("PTK® Tapes,", BRAND)).toBe("ptk tapes");
  });
});

describe("reading the navigation", () => {
  it("takes the product labels the owner wrote", () => {
    const out = navTerms(HOME, BRAND);
    expect(out).toContain("bopp tapes");
    expect(out).toContain("double sided tissue tapes");
    expect(out).toContain("polyester tapes");
    expect(out).toContain("kraft paper tapes");
  });

  it("leaves the chrome out", () => {
    const out = navTerms(HOME, BRAND);
    for (const c of ["home", "about us", "contact us", "cart", "follow us"]) {
      expect(out, c).not.toContain(c);
    }
  });

  it("finds a menu on a site with no nav element", () => {
    // Older PHP sites, which is a large share of what this tool sees.
    const html = `<div><ul class="main-menu">
      <li><a href="/a">Industrial Fasteners</a></li>
      <li><a href="/b">Brass Fittings</a></li>
    </ul></div>`;
    const out = navTerms(html, brandFilterFor(null, "https://x.example"));
    expect(out).toContain("industrial fasteners");
    expect(out).toContain("brass fittings");
  });
});

describe("reading JSON-LD", () => {
  it("takes declared product names", () => {
    expect(schemaProductTerms(PRODUCT_PAGE, BRAND)).toContain("bopp adhesive tape");
  });

  it("ignores the brand node next to it", () => {
    // The Brand node also has a `name`. Taking every name in the
    // document put the company back in the vocabulary.
    expect(schemaProductTerms(PRODUCT_PAGE, BRAND)).not.toContain("prateek tapes");
  });

  it("survives malformed JSON-LD without throwing", () => {
    const html = `<script type="application/ld+json">{ not json </script>`;
    expect(schemaProductTerms(html, brandFilterFor(null, "https://x.example"))).toEqual([]);
  });
});

describe("choosing which pages to read", () => {
  it("refuses pages that are not about the business", () => {
    const o = "https://x.com";
    for (const p of ["/cart", "/checkout", "/wp-login.php", "/privacy-policy", "/my-account"]) {
      expect(isWorthReading(`${o}${p}`, o), p).toBe(false);
    }
  });

  it("refuses pages that name somebody else's business", () => {
    // Nine of the thirteen pages read on a real agency site were
    // portfolio entries, so its two most confident terms were "bravo
    // pizza nyc" and "anahat exclusive" — two of its clients. Seeding
    // those returns keywords about a pizza restaurant in New York.
    const o = "https://x.com";
    for (const p of [
      "/portfolio/bravo-pizza-nyc/",
      "/portfolio-category/ecommerce/",
      "/case-studies/acme",
      "/our-work",
      "/testimonials",
      "/blog/2024/news",
    ]) {
      expect(isWorthReading(`${o}${p}`, o), p).toBe(false);
    }
  });

  it("still reads the pages that name what this business sells", () => {
    // Guards the guard above: a skip list that catches everything is a
    // reader that reads nothing.
    const o = "https://x.com";
    for (const p of ["/seo-services/", "/products/bopp-tapes", "/collections/cakes"]) {
      expect(isWorthReading(`${o}${p}`, o), p).toBe(true);
    }
  });

  it("refuses anything that is not a page", () => {
    const o = "https://x.com";
    expect(isWorthReading(`${o}/brochure.pdf`, o)).toBe(false);
    expect(isWorthReading(`${o}/logo.png`, o)).toBe(false);
  });

  it("refuses another site", () => {
    expect(isWorthReading("https://facebook.com/x", "https://x.com")).toBe(false);
  });

  it("refuses the homepage, which is read first and separately", () => {
    expect(isWorthReading("https://x.com/", "https://x.com")).toBe(false);
  });

  it("reads nav-linked product pages before blog posts", () => {
    const o = "https://x.com";
    const nav = new Set([`${o}/products/bopp-tapes`]);
    const ranked = rankPages(
      [`${o}/blog/2024/news`, `${o}/products/bopp-tapes`, `${o}/team`],
      nav,
    );
    expect(ranked[0]).toBe(`${o}/products/bopp-tapes`);
    expect(ranked[ranked.length - 1]).toBe(`${o}/blog/2024/news`);
  });
});

describe("telling the company apart from what it sells", () => {
  it("takes the distinctive word from the name and the domain", () => {
    const b = brandFilterFor("Prateek Tapes", "https://www.prateektapes.com");
    expect(b.distinctive.has("prateek")).toBe(true);
    expect(b.distinctive.has("prateektapes")).toBe(true);
  });

  it("does not claim the trade word the company is named after", () => {
    // This is the bug that made this a filter instead of a word list.
    // "Prateek Tapes" put "tapes" on the brand list, so the nav label
    // "BOPP Tapes" was stripped to "bopp" — the head noun of the whole
    // product range, deleted, on every single term.
    const b = brandFilterFor("Prateek Tapes", "https://prateektapes.com");
    expect(b.distinctive.has("tapes")).toBe(false);
    expect(normaliseTerm("BOPP Tapes", b)).toBe("bopp tapes");
  });

  it("skips a corporate suffix when picking the distinctive word", () => {
    const b = brandFilterFor("The Acme Group Ltd", "https://acme.example");
    expect(b.distinctive.has("acme")).toBe(true);
    expect(b.distinctive.has("the")).toBe(false);
    expect(b.distinctive.has("group")).toBe(false);
  });

  it("does not treat the TLD as a brand word", () => {
    const b = brandFilterFor(null, "https://x.co.uk");
    expect(b.distinctive.has("uk")).toBe(false);
    expect(b.distinctive.has("co")).toBe(false);
  });

  it("finds the brand in a subdomain rather than the subdomain itself", () => {
    // A real staging site. Taking only the first label read the brand as
    // "d", too short to keep, so the real brand was never filtered — and
    // the site's own title, "d.dicecodes.com", came out as a product.
    const b = brandFilterFor(null, "https://d.dicecodes.com");
    expect(b.distinctive.has("dicecodes")).toBe(true);
    expect(normaliseTerm("d.dicecodes.com", b)).toBeNull();
  });
});

describe("reading a whole site", () => {
  const pages = {
    "/": HOME,
    "/products/bopp-tapes": PRODUCT_PAGE,
    "/products/polyester-tapes": `<html><head><title>Polyester Tapes | Prateek Tapes</title></head><body><h1>Polyester Tapes</h1></body></html>`,
  };

  it("finds the range the meta description never mentioned", async () => {
    // The description on this fixture is "Quality products since 1987."
    // — the exact case that used to produce "welcome website near me".
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf(pages),
    });
    const terms = v.terms.map((t) => t.term);
    expect(terms).toContain("bopp tapes");
    expect(terms).toContain("polyester tapes");
    expect(terms).toContain("kraft paper tapes");
  });

  it("ranks a term three parts of the site agreed on above a lone heading", async () => {
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf(pages),
    });
    const bopp = v.terms.find((t) => t.term === "bopp tapes")!;
    const slit = v.terms.find((t) => t.term === "custom slit widths")!;
    expect(bopp.sources.length).toBeGreaterThan(1);
    expect(bopp.confidence).toBeGreaterThan(slit.confidence);
  });

  it("reports which pages it read", async () => {
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf(pages),
    });
    expect(v.pagesRead).toBe(3);
    expect(v.urlsRead).toContain("https://prateektapes.com/products/bopp-tapes");
  });

  it("keeps the homepage's own description of itself, verbatim", async () => {
    // Separate from the terms because it answers a different question.
    // A term has to be something a person would type; this has to be
    // what the business says it is.
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf(pages),
    });
    expect(v.selfDescription).toContain("Adhesive Tape Manufacturer");
    expect(v.selfDescription).toContain("Quality products since 1987");
  });

  it("never puts the company name in the vocabulary", async () => {
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf(pages),
    });
    expect(v.terms.map((t) => t.term)).not.toContain("prateek tapes");
  });
});

describe("when it cannot read the site", () => {
  it("says so rather than returning nothing silently", async () => {
    const v = await readSiteVocabulary("https://down.example", {
      fetchPage: async () => null,
    });
    expect(v.terms).toEqual([]);
    expect(v.note).toMatch(/could not be read/);
  });

  it("says so for a JS-only page with an empty body", async () => {
    // A React SPA served without SSR. Common, and the failure has to be
    // visible: an empty vocabulary that looks like a successful read is
    // how a client silently gets no keywords.
    const v = await readSiteVocabulary("https://spa.example", {
      fetchPage: async (url) => ({
        url,
        html: `<html><head><title>App</title></head><body><div id="root"></div></body></html>`,
      }),
    });
    expect(vocabularySeeds(v)).toEqual([]);
    expect(v.note).toMatch(/named nothing/);
  });

  it("says nothing when the read did work", async () => {
    // Guards the guard above: a note that is always set says nothing.
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf({ "/": HOME, "/products/bopp-tapes": PRODUCT_PAGE }),
    });
    expect(v.note).toBeUndefined();
  });
});

describe("turning a vocabulary into seeds", () => {
  it("only passes on terms more than one part of the site agreed on", async () => {
    const v = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: siteOf({
        "/": HOME,
        "/products/bopp-tapes": PRODUCT_PAGE,
      }),
    });
    const seeds = vocabularySeeds(v);
    expect(seeds).toContain("bopp tapes");
    // Seen once, in one h2, on one page. That is a guess.
    expect(seeds).not.toContain("custom slit widths");
  });

  it("returns an empty list for an empty vocabulary", () => {
    expect(
      vocabularySeeds({ pagesRead: 0, urlsRead: [], selfDescription: null, terms: [], brandWords: [] }),
    ).toEqual([]);
  });
});
