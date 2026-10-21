import * as cheerio from "cheerio";
import type { AnyNode, Element } from "cheerio";
import { urljoin } from "@/lib/geo-audit/url-utils";

const BLOCK_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "pre",
  "dt",
  "dd",
  "td",
  "th",
  "figcaption",
]);

const CHROME_TAGS = new Set(["nav", "aside"]);
const FALLBACK_CHROME_TAGS = new Set(["nav", "aside", "header", "footer"]);

const CHROME_ROLES = new Set([
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "menubar",
]);

const CHROME_PATTERN =
  /(?:^|[-_ ])(?:ad|ads|advert|advertisement|promo|sponsor|banner|cookie|consent|newsletter|subscribe|signup|social|share|sharing|breadcrumb|pagination|pager|sidebar|widget|related|recirc|comments?|disqus|skip-link|screen-reader|sr-only|visually-hidden)(?:[-_ ]|$)/i;

const FRAMEWORK_ROOT_ID = /^(?:app|root|__next|__nuxt|__layout|svelte)$/i;

const JS_REQUIRED_PATTERN =
  /(?:enable|turn on|requires?|needs?)\s+javascript|javascript\s+is\s+(?:required|disabled)|you\s+need\s+to\s+enable\s+js/i;

const WS = /\s+/g;

export function normalizeText(value: string): string {
  return value.replace(WS, " ").trim();
}

export type Block = {
  kind: string;
  text: string;
  section: number;
  words: number;
};

export type GeoDocument = {
  url: string;
  lang: string | null;
  title: string | null;
  meta: Record<string, string>;
  blocks: Block[];
  headings: Array<[number, string]>;
  jsonld: Record<string, unknown>[];
  jsonldErrors: string[];
  internalLinks: string[];
  externalLinks: string[];
  contentRoot: string;
  bodyChars: number;
  lists: number;
  tables: number;
  images: number;
  imagesWithAlt: number;
  jsRequiredNotice: boolean;
  frameworkRootChars: number | null;
};

export function contentChars(doc: GeoDocument): number {
  return doc.blocks.reduce((sum, b) => sum + b.text.length, 0);
}

export function proseBlocks(doc: GeoDocument): Block[] {
  return doc.blocks.filter((b) =>
    ["p", "li", "blockquote", "dd"].includes(b.kind),
  );
}

function isChrome(el: Element): boolean {
  const role = el.attribs?.role;
  if (typeof role === "string" && CHROME_ROLES.has(role.trim().toLowerCase())) {
    return true;
  }
  const tokens: string[] = [];
  const cls = el.attribs?.class;
  if (cls) tokens.push(cls);
  const id = el.attribs?.id;
  if (id) tokens.push(id);
  return tokens.some((token) => CHROME_PATTERN.test(String(token)));
}

const MIN_ROOT_SHARE = 0.1;

function holdsThePage($: cheerio.CheerioAPI, candidate: Element): boolean {
  const body = $("body").get(0);
  const pageText = normalizeText($(body ?? "html").text());
  const pageChars = pageText.length;
  if (!pageChars) return true;

  const trial = $(candidate).clone();
  trial.find(Array.from(CHROME_TAGS).join(",")).remove();
  const share = normalizeText(trial.text()).length / pageChars;
  return share >= MIN_ROOT_SHARE;
}

function pickRoot($: cheerio.CheerioAPI): { node: Element | null; name: string } {
  const main = $("main").first().get(0);
  if (main) return { node: main, name: "main" };

  const articles = $("article").toArray();
  if (articles.length === 1 && holdsThePage($, articles[0]!)) {
    return { node: articles[0]!, name: "article" };
  }

  const roleMain = $('[role="main"]').first().get(0);
  if (roleMain) return { node: roleMain, name: "role=main" };

  const body = $("body").first().get(0);
  if (body) return { node: body, name: "body" };

  const html = $("html").first().get(0);
  return { node: html ?? null, name: "document" };
}

function collectJsonLd($: cheerio.CheerioAPI): {
  blocks: Record<string, unknown>[];
  errors: string[];
} {
  const blocks: Record<string, unknown>[] = [];
  const errors: string[] = [];
  $('script[type*="ld+json"]').each((_, el) => {
    const raw = $(el).html() ?? "";
    if (!raw.trim()) {
      errors.push("empty ld+json block");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const graph =
        typeof parsed === "object" &&
        parsed !== null &&
        "@graph" in parsed &&
        Array.isArray((parsed as { "@graph": unknown })["@graph"])
          ? (parsed as { "@graph": unknown[] })["@graph"]
          : parsed;
      const items = Array.isArray(graph) ? graph : [graph];
      for (const item of items) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          blocks.push(item as Record<string, unknown>);
        } else {
          errors.push("ld+json entry is not an object");
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid JSON";
      errors.push(`invalid JSON: ${msg}`);
    }
  });
  return { blocks, errors };
}

const DIRECTIVE_META = new Set(["robots"]);

function collectMeta($: cheerio.CheerioAPI): Record<string, string> {
  const meta: Record<string, string> = {};
  $("meta").each((_, el) => {
    const key =
      el.attribs?.name ?? el.attribs?.property ?? el.attribs?.itemprop;
    const value = el.attribs?.content;
    if (typeof key === "string" && typeof value === "string") {
      const k = key.trim().toLowerCase();
      const v = normalizeText(value);
      if (DIRECTIVE_META.has(k) && meta[k]) {
        meta[k] = `${meta[k]}, ${v}`;
      } else {
        meta[k] ??= v;
      }
    }
  });
  const canonical = $('link[rel="canonical"]').first().attr("href");
  if (typeof canonical === "string") {
    meta.canonical = canonical.trim();
  }
  return meta;
}

function stripChrome($: cheerio.CheerioAPI, $root: cheerio.Cheerio<Element>, chromeTags: Set<string>) {
  $root.find(Array.from(chromeTags).join(",")).remove();
  $root.find("*").each((_, el) => {
    if (isChrome(el)) {
      $(el).remove();
    }
  });
}

function hasBlockAncestor(node: AnyNode, $: cheerio.CheerioAPI): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.type === "tag" && BLOCK_TAGS.has(parent.name)) return true;
    parent = parent.parent;
  }
  return false;
}

export function extract(html: string, url: string): GeoDocument {
  const $ = cheerio.load(html);
  const doc: GeoDocument = {
    url,
    lang: null,
    title: null,
    meta: {},
    blocks: [],
    headings: [],
    jsonld: [],
    jsonldErrors: [],
    internalLinks: [],
    externalLinks: [],
    contentRoot: "body",
    bodyChars: 0,
    lists: 0,
    tables: 0,
    images: 0,
    imagesWithAlt: 0,
    jsRequiredNotice: false,
    frameworkRootChars: null,
  };

  const lang = $("html").attr("lang");
  if (typeof lang === "string" && lang.trim()) {
    doc.lang = lang.trim();
  }

  const titleText = $("title").first().text();
  if (titleText) {
    doc.title = normalizeText(titleText) || null;
  }

  doc.meta = collectMeta($);
  const jsonld = collectJsonLd($);
  doc.jsonld = jsonld.blocks;
  doc.jsonldErrors = jsonld.errors;

  let noscriptText = "";
  $("noscript").each((_, el) => {
    noscriptText += ` ${normalizeText($(el).text())}`;
  });

  const mounts: number[] = [];
  $("[id]").each((_, el) => {
    const id = el.attribs?.id;
    if (id && FRAMEWORK_ROOT_ID.test(id)) {
      mounts.push(normalizeText($(el).text()).length);
    }
  });
  if (mounts.length) {
    doc.frameworkRootChars = Math.min(...mounts);
  }

  $(
    "script, style, template, svg, canvas, iframe, object, embed, form, button, select, textarea, video, audio, map, dialog, noscript",
  ).remove();

  const bodyEl = $("body").first();
  doc.bodyChars = normalizeText(bodyEl.text()).length;
  doc.jsRequiredNotice =
    JS_REQUIRED_PATTERN.test(noscriptText) ||
    JS_REQUIRED_PATTERN.test(normalizeText(bodyEl.text()));

  const { node: rootNode, name: rootName } = pickRoot($);
  doc.contentRoot = rootName;
  if (!rootNode) {
    return doc;
  }

  const $root = $(rootNode);
  const chromeTags =
    rootName === "body" || rootName === "document"
      ? FALLBACK_CHROME_TAGS
      : CHROME_TAGS;
  stripChrome($, $root, chromeTags);

  doc.lists = $root.find("ul, ol").length;
  doc.tables = $root.find("table").length;
  $root.find("img").each((_, img) => {
    doc.images += 1;
    const alt = img.attribs?.alt;
    if (typeof alt === "string" && alt.trim()) {
      doc.imagesWithAlt += 1;
    }
  });

  const pageHost = hostFromUrl(url);
  $root.find("a[href]").each((_, anchor) => {
    const href = anchor.attribs?.href;
    if (!href?.trim()) return;
    const target = urljoin(url, href.trim());
    try {
      const u = new URL(target);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      const host = hostFromUrl(target);
      if (host && host !== pageHost) {
        doc.externalLinks.push(target);
      } else {
        doc.internalLinks.push(target);
      }
    } catch {
      /* ignore bad URLs */
    }
  });

  if (doc.title) {
    doc.blocks.push({
      kind: "title",
      text: doc.title,
      section: -1,
      words: doc.title.split(/\s+/).filter(Boolean).length,
    });
  }

  let section = -1;
  $root.find(Array.from(BLOCK_TAGS).join(",")).each((_, node) => {
    const tag = node.tagName?.toLowerCase();
    if (!tag || !BLOCK_TAGS.has(tag)) return;
    if (hasBlockAncestor(node, $)) return;
    const text = normalizeText($(node).text());
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      doc.headings.push([level, text]);
      if (level <= 2) section += 1;
    }
    doc.blocks.push({
      kind: tag,
      text,
      section,
      words: text.split(/\s+/).filter(Boolean).length,
    });
  });

  return doc;
}

function hostFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function excerpt(text: string, limit = 280): string {
  let clean = normalizeText(text);
  clean = clean.replace(/`/g, "'").replace(/</g, "‹").replace(/>/g, "›");
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trimEnd()}…`;
}
