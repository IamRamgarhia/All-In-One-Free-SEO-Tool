/**
 * Values captured inside the French templates: lists the rules join,
 * sizes, decimals, "and N more". Each case below was read in English on
 * a real French audit page (/audits/25) before this existed.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ITEMS_FR, translateEngineMessage } from "./translate-message";
import { issueMessage } from "@/lib/issue-display";

const NBSP = " ";

describe("values captured in a French template are French too", () => {
  it("joined list items", () => {
    expect(
      translateEngineMessage("perf-render-blocking", "Render-blocking resources found: 1 script(s) in <head> without async/defer"),
    ).toBe("Ressources bloquant le rendu trouvées : 1 script(s) dans le <head> sans async ni defer");
    expect(translateEngineMessage("perf-css-file-size", "CSS could be optimized: 5 external CSS files - consider bundling")).toBe(
      "Le CSS pourrait être optimisé : 5 fichiers CSS externes : envisagez de les regrouper",
    );
    expect(
      translateEngineMessage("perf-lcp-hints", 'LCP candidate (header img) could be optimized: missing fetchpriority="high"'),
    ).toBe('L’élément candidat au LCP (header img) pourrait être optimisé : fetchpriority="high" absent');
    expect(
      translateEngineMessage("schema-local-business", "LocalBusiness schema has warnings: LocalBusiness: missing recommended fields: priceRange"),
    ).toBe("Le schéma LocalBusiness comporte des avertissements : LocalBusiness : champs recommandés absents : priceRange");
  });

  it("a message that is itself the joined list", () => {
    expect(translateEngineMessage("images-figure-captions", "5 figure(s) missing figcaption; 1 figure(s) without images")).toBe(
      "5 élément(s) figure sans figcaption ; 1 élément(s) figure sans image",
    );
  });

  it("sizes in Ko, decimals with a comma, a no-break space before %", () => {
    expect(
      translateEngineMessage("perf-page-weight", "HTML document is 170KB (recommended: <100KB) \u2014 consider externalizing inline resources"),
    ).not.toMatch(/KB/);
    expect(
      translateEngineMessage("perf-page-weight", "HTML document is 170KB (recommended: <100KB) \u2014 consider externalizing inline resources"),
    ).toContain(`170${NBSP}Ko`);
    expect(translateEngineMessage("images-responsive", "Found 22 image(s) not using responsive techniques (95.7%)")).toBe(
      `22 image(s) sans technique d’image adaptative (95,7${NBSP}%)`,
    );
    expect(
      translateEngineMessage("content-text-html-ratio", "Very low text-to-HTML ratio: 5.5% (9532 text bytes / 172978 HTML bytes)"),
    ).toBe(`Ratio texte/HTML très faible : 5,5${NBSP}% (9532 octets de texte / 172978 octets de HTML)`);
  });

  it("the « …, and 7 more » at the end of a long list", () => {
    const fr = translateEngineMessage(
      "perf-asset-cache-policy",
      "12 of 29 static asset(s) lack an efficient cache policy: https://a.example/x.webp (max-age=0s), https://a.example/y.webp (max-age=0s), and 7 more",
    );
    expect(fr).toMatch(/, et 7 autres$/);
    expect(fr).not.toMatch(/and 7 more/);
    // URLs are left exactly as they were.
    expect(fr).toContain("https://a.example/x.webp (max-age=0s)");
  });

  it("readability bands", () => {
    expect(translateEngineMessage("content-reading-level", "Content may be too complex: 42.8 (Difficult (college level))")).not.toMatch(
      /Difficult|college|42\.8/,
    );
  });

  it("a number inside a URL is never touched", () => {
    const fr = translateEngineMessage(
      "perf-image-encoding",
      "1 image(s) transferred over 100KB: https://a.example/v1.5/img.webp (114KB)",
    );
    expect(fr).toContain("https://a.example/v1.5/img.webp");
    expect(fr).toContain(`(114${NBSP}Ko)`);
  });
});

describe("English stays English", () => {
  it("the stored message is shown unchanged in English", () => {
    const en = "Render-blocking resources found: 1 script(s) in <head> without async/defer";
    expect(issueMessage("seomator:perf-render-blocking", en, "en")).toBe(en);
    const pct = "Found 22 image(s) not using responsive techniques (95.7%)";
    expect(issueMessage("seomator:images-responsive", pct, "en")).toBe(pct);
  });
});

/**
 * Coverage: every list item the covered rules push has a French version.
 * A rule that gains a new item fails here instead of showing English
 * inside a French sentence.
 */
const COVERED = [
  "performance/render-blocking.ts",
  "performance/css-file-size.ts",
  "performance/lcp-hints.ts",
  "images/figure-captions.ts",
  "schema/local-business.ts",
  "schema/article.ts",
];

function pushedItems(file: string): string[] {
  const src = readFileSync(join(process.cwd(), "src/audit/rules", file), "utf8");
  const out: string[] = [];
  for (const m of src.matchAll(/(?:issues|warnings)\.push\(\s*(`[^`]*`|"[^"]*"|'[^']*')\s*\)/g)) {
    let n = 0;
    out.push(
      m[1]
        .slice(1, -1)
        .replace(/\$\{[^}]*\}/g, () => `{${n++}}`)
        .replace(/\\"/g, '"'),
    );
  }
  return out;
}

describe("coverage of the list items", () => {
  it("finds the items it checks (guards the guard)", () => {
    expect(COVERED.flatMap(pushedItems).length).toBeGreaterThanOrEqual(15);
  });

  it("every item pushed by a covered rule has a French version", () => {
    const known = new Set(ITEMS_FR.map((e) => e.en));
    const missing = COVERED.flatMap((f) => pushedItems(f).map((en) => ({ f, en }))).filter(({ en }) => !known.has(en));
    expect(missing).toEqual([]);
  });

  it("every French item keeps the values of its English one", () => {
    for (const e of ITEMS_FR) {
      const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort();
      expect(slots(e.fr), e.en).toEqual(slots(e.en));
    }
  });
});
