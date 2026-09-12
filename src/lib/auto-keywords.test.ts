import { describe, expect, it } from "vitest";
import {
  brandSeeds,
  businessVoice,
  descriptorFor,
  servicePhrases,
} from "./auto-keywords";
import { readSiteVocabulary } from "./site-vocabulary";

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

/**
 * Reading the site rather than one tag.
 *
 * Everything above works off `description`, which is `<meta
 * name="description">` captured when the client was added. On the tape
 * manufacturer that tag happened to list the entire product range, the
 * keywords came out excellent, and the good result hid the fact that
 * nothing else was ever read.
 *
 * The two cases below are what the rest of the web looks like: a
 * description that says nothing, and no description at all. Both used to
 * produce garbage or silence, and the site's own navigation had the
 * answer sitting in it the whole time.
 */
const TAPES_HOME = `<html><head>
<title>Adhesive Tape Manufacturer | Prateek Tapes</title></head>
<body><nav>
  <a href="/">Home</a>
  <a href="/bopp">BOPP Tapes</a>
  <a href="/masking">Masking Tapes</a>
  <a href="/polyester">Polyester Tapes</a>
  <a href="/contact">Contact Us</a>
</nav>
<h1>Adhesive Tape Manufacturer</h1>
<h2>BOPP Tapes</h2>
<h2>Masking Tapes</h2>
</body></html>`;

const BAKERY_HOME = `<html><head>
<title>Sunrise Bakery | Fresh Bread in Ludhiana</title></head>
<body><nav>
  <a href="/">Home</a>
  <a href="/breads">Sourdough Breads</a>
  <a href="/cakes">Celebration Cakes</a>
  <a href="/bulk-orders">Bulk Orders</a>
</nav>
<h1>Sourdough Breads</h1>
</body></html>`;

const onePage = (html: string) => async (url: string) =>
  new URL(url).pathname === "/" ? { url, html } : null;

describe("reading the site instead of one meta tag", () => {
  it("names the range a useless description never mentioned", async () => {
    const siteVocabulary = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: onePage(TAPES_HOME),
    });
    const phrases = servicePhrases({
      clientName: "Prateek Tapes",
      domain: "prateektapes.com",
      // The exact shape that used to produce "welcome website near me".
      description: "Quality products since 1987.",
      country: "IN",
      siteVocabulary,
    });
    expect(phrases).toContain("bopp tapes");
    expect(phrases).toContain("masking tapes");
    // And none of the word soup the description alone would have given.
    expect(phrases).not.toContain("quality products");
  });

  it("works with no description at all", async () => {
    // Before this the answer was an empty seed list, and discovery fell
    // back to the brand name — the seed that produced sixty keywords
    // about Monopoly Go.
    const siteVocabulary = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: onePage(TAPES_HOME),
    });
    const phrases = servicePhrases({
      clientName: "Prateek Tapes",
      domain: "prateektapes.com",
      description: null,
      country: "IN",
      siteVocabulary,
    });
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases).toContain("bopp tapes");
  });

  it("keeps the description path working when the site cannot be read", () => {
    // The reader returns an empty vocabulary far more often than anyone
    // would like — JS-only pages, blocked bots, brochure sites with no
    // headings — and when it does, everything above has to still work.
    const phrases = servicePhrases({
      ...DICE,
      siteVocabulary: {
        pagesRead: 1,
        urlsRead: ["https://dicecodes.com"],
        selfDescription: null,
        terms: [],
        brandWords: [],
        note: "named nothing",
      },
    });
    expect(phrases).toContain("digital marketing");
  });
});

describe("deciding trade or retail from the whole site", () => {
  it("drops 'near me' for a manufacturer tagged as a local business", async () => {
    // The niche tag on this real client says "local". Its site says
    // manufacturer, in the title and in the h1. Nobody sourcing
    // industrial tape types "near me".
    const siteVocabulary = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: onePage(TAPES_HOME),
    });
    const seeds = brandSeeds({
      clientName: "Prateek Tapes",
      domain: "prateektapes.com",
      niche: "local",
      description: "Making tape in Delhi since 1987.",
      country: "IN",
      siteVocabulary,
    });
    expect(seeds.some((s) => s.includes("near me"))).toBe(false);
    expect(seeds).toContain("bopp tapes manufacturer");
  });

  it("reads the trade signal out of the homepage title alone", async () => {
    // The real site says it in exactly one place: "Prateek Tapes —
    // Adhesive Tape Manufacturer India Since 1987". That title is six
    // words past the product-name limit, so it yields no term at all,
    // and judging the business on terms alone missed it entirely.
    const titleOnly = `<html><head>
<title>Prateek Tapes — Adhesive Tape Manufacturer India Since 1987</title></head>
<body><nav><a href="/">Home</a><a href="/bopp">BOPP Tapes</a></nav>
<h1>BOPP Tapes</h1></body></html>`;
    const siteVocabulary = await readSiteVocabulary("https://prateektapes.com", {
      brand: "Prateek Tapes",
      fetchPage: onePage(titleOnly),
    });
    expect(siteVocabulary.terms.some((t) => /manufacturer/.test(t.term))).toBe(
      false,
    );
    const input = {
      clientName: "Prateek Tapes",
      domain: "prateektapes.com",
      niche: "local",
      description: "Quality products since 1987.",
      country: "IN",
      siteVocabulary,
    };
    expect(businessVoice(input)).toMatch(/manufacturer/i);
    expect(brandSeeds(input).some((s) => s.includes("near me"))).toBe(false);
  });

  it("keeps 'near me' for a bakery that happens to take bulk orders", async () => {
    // The false positive that matters. "Bulk Orders" sits in this
    // bakery's nav and nowhere else, and reading it as a trade signal
    // would take "near me" off a business whose customers genuinely
    // search it. One mention in one place is not evidence.
    const siteVocabulary = await readSiteVocabulary("https://sunrisebakery.example", {
      brand: "Sunrise Bakery",
      fetchPage: onePage(BAKERY_HOME),
    });
    const input = {
      clientName: "Sunrise Bakery",
      domain: "sunrisebakery.example",
      niche: "local",
      description: "A bakery in Ludhiana.",
      country: "IN",
      siteVocabulary,
    };
    expect(businessVoice(input)).not.toMatch(/bulk/);
    expect(brandSeeds(input).some((s) => s.includes("near me"))).toBe(true);
  });
});
