/**
 * Markdown export for generated blog drafts. Used by the review queue so a
 * draft can be handed to another AI or dropped into a static-site project
 * (Astro, Next.js, Hugo…) instead of being pushed to WordPress.
 *
 * Pure functions: the words that go into the file (default brief, labels)
 * come from the messages of the article's language and are passed in.
 */

/** The words written into the file, in the article's language. */
export type BlogExportTexts = {
  /** Title used when the draft has none. */
  untitled: string;
  /** Brief used when the schedule has none of its own. */
  defaultBrief: string;
  /** First line of the brief comment, e.g. "AI BRIEF". */
  briefHeading: string;
  /** Label before the focus keywords, e.g. "Focus keywords: ". */
  focusKeywords: string;
};

export function slugify(text: string, max = 60): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Tiny converter — handles the elements the blog-draft generator emits.
 * Good enough for paste-into-Medium / paste-into-Notion / static-site files.
 */
export function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  md = md.replace(/<\/?(strong|b)>/gi, "**");
  md = md.replace(/<\/?(em|i)>/gi, "_");
  md = md.replace(/<\/?code>/gi, "`");
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n\n");
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?(ul|ol|blockquote)[^>]*>/gi, "\n");
  md = md.replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

/** A JSON string is also a valid double-quoted YAML scalar. */
const yamlStr = (s: string) => JSON.stringify(s);

export type BlogExportInput = {
  title: string | null;
  body: string | null;
  payload?: Record<string, unknown> | null;
  date?: Date;
};

export function blogKeywords(payload?: Record<string, unknown> | null): string[] {
  const k = payload?.keywords;
  return Array.isArray(k)
    ? k.map((x) => String(x).trim()).filter(Boolean)
    : [];
}

const FR_WORDS = /\b(le|la|les|des|une|est|pour|avec|vous|votre|dans|sur|qui|que|pas|aux|du)\b/gi;
const EN_WORDS = /\b(the|and|for|with|you|your|is|are|this|that|of|to|in|on|not|how)\b/gi;

/**
 * The language the article is written in: the one recorded at generation
 * time, else a word count on the text (only French and English have
 * messages, so anything that is not French reads as English).
 */
export function articleLocale(input: BlogExportInput): "fr" | "en" {
  const recorded = input.payload?.language;
  if (typeof recorded === "string" && recorded.trim()) {
    return recorded.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
  }
  const text = `${input.title ?? ""} ${(input.body ?? "").replace(/<[^>]+>/g, " ")}`;
  const fr = text.match(FR_WORDS)?.length ?? 0;
  const en = text.match(EN_WORDS)?.length ?? 0;
  return fr > en ? "fr" : "en";
}

/**
 * Markdown with YAML frontmatter (keys stay in English: static-site
 * generators expect them). With `forAi`, an HTML-comment brief follows the
 * frontmatter (invisible if the file is published as-is) telling an AI how
 * to enrich the article.
 */
export function buildBlogMarkdown(
  input: BlogExportInput,
  texts: BlogExportTexts,
  opts: { forAi?: boolean } = {},
): string {
  const title = input.title?.trim() || texts.untitled;
  const payload = input.payload ?? {};
  const description = String(payload.metaDescription ?? "").trim();
  const excerpt = String(payload.excerpt ?? "").trim();
  const keywords = blogKeywords(payload);
  const date = (input.date ?? new Date()).toISOString().slice(0, 10);

  const fm = [
    "---",
    `title: ${yamlStr(title)}`,
    `description: ${yamlStr(description || excerpt)}`,
    `slug: ${slugify(title, 80) || "draft"}`,
    `date: ${date}`,
    `keywords: [${keywords.map(yamlStr).join(", ")}]`,
    ...(excerpt ? [`excerpt: ${yamlStr(excerpt)}`] : []),
    "---",
  ].join("\n");

  const parts = [fm];
  if (opts.forAi) {
    const brief =
      typeof payload.aiBrief === "string" && payload.aiBrief.trim()
        ? payload.aiBrief.trim()
        : texts.defaultBrief;
    const kw = keywords.length
      ? `\n${texts.focusKeywords}${keywords.join(", ")}`
      : "";
    // "--" would end an HTML comment early.
    parts.push(
      `<!-- ${texts.briefHeading}\n${`${brief}${kw}`.replace(/--/g, "—")}\n-->`,
    );
  }
  parts.push(htmlToMarkdown(input.body ?? ""));
  return parts.join("\n\n") + "\n";
}
