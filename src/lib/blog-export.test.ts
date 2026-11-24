import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  articleLocale,
  buildBlogMarkdown,
  htmlToMarkdown,
  slugify,
  type BlogExportTexts,
} from "./blog-export";

const texts = (m: typeof en): BlogExportTexts => {
  const t = m.ui.blog_export;
  return {
    untitled: t.untitled,
    defaultBrief: t.defaultBrief,
    briefHeading: t.briefHeading,
    focusKeywords: t.focusKeywords,
  };
};
const EN = texts(en);
const FR = texts(fr as typeof en);

const base = {
  title: 'Best "espresso" tips: café edition',
  body: "<p>Hello <strong>world</strong></p><h2>Why</h2><ul><li>One</li></ul>",
  payload: {
    metaDescription: "A short description.",
    excerpt: "Teaser.",
    keywords: ["espresso tips", "home barista"],
    language: "en",
  },
  date: new Date("2026-10-26T10:00:00Z"),
};

describe("blog-export", () => {
  it("slugifies accents and punctuation", () => {
    expect(slugify("Café: Best Tips!")).toBe("cafe-best-tips");
  });

  it("converts the generator's HTML to Markdown", () => {
    expect(htmlToMarkdown(base.body)).toBe("Hello **world**\n\n## Why\n\n- One");
    expect(htmlToMarkdown("<h2>Why</h2><p>Because.</p>")).toBe("## Why\n\nBecause.");
  });

  it("writes frontmatter with escaped strings and keywords", () => {
    const md = buildBlogMarkdown(base, EN);
    expect(md).toContain('title: "Best \\"espresso\\" tips: café edition"');
    expect(md).toContain('description: "A short description."');
    expect(md).toContain("slug: best-espresso-tips-cafe-edition");
    expect(md).toContain("date: 2026-10-26");
    expect(md).toContain('keywords: ["espresso tips", "home barista"]');
    expect(md).not.toContain(EN.briefHeading);
  });

  it("adds the default brief and keywords for AI export", () => {
    const md = buildBlogMarkdown(base, EN, { forAi: true });
    expect(md).toContain(`<!-- ${EN.briefHeading}`);
    expect(md).toContain(EN.defaultBrief.split("\n")[0]);
    expect(md).toContain("Focus keywords: espresso tips, home barista");
  });

  it("writes the brief in French for a French article", () => {
    const md = buildBlogMarkdown(
      { ...base, payload: { ...base.payload, language: "fr" } },
      FR,
      { forAi: true },
    );
    expect(md).toContain("CONSIGNE POUR L’IA");
    expect(md).toContain("Mots-clés principaux : espresso tips");
  });

  it("prefers the schedule's own brief and keeps the comment well-formed", () => {
    const md = buildBlogMarkdown(
      { ...base, payload: { ...base.payload, aiBrief: "Write -- in Romanian" } },
      EN,
      { forAi: true },
    );
    expect(md).toContain("Write — in Romanian");
    expect(md).not.toContain(EN.defaultBrief.split("\n")[0]);
    expect(md.match(/-->/g)).toHaveLength(1);
  });

  it("reads the article's language from the payload, else from its words", () => {
    expect(articleLocale(base)).toBe("en");
    expect(articleLocale({ ...base, payload: { language: "fr-FR" } })).toBe("fr");
    expect(
      articleLocale({
        title: "Comment choisir une machine",
        body: "<p>Pour bien choisir, il faut regarder la pression et les accessoires dans le détail.</p>",
      }),
    ).toBe("fr");
    expect(articleLocale({ title: "How to pick a machine", body: "<p>You need to look at the pressure.</p>" })).toBe("en");
  });
});
