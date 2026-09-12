/**
 * Reading what a business actually sells, off its own pages.
 *
 * Keyword discovery used to seed itself from one tag: `<meta
 * name="description">`. On a client whose description happened to list
 * its whole product range that worked well, and the good result hid the
 * mechanism. A site with a vague description ("Quality products since
 * 1987") produced "welcome website near me"; a site with no description
 * produced nothing at all. Both are common and neither is the site's
 * fault.
 *
 * The information was never missing. It is in the navigation, the page
 * titles and the h1s, where the business itself decided how to name the
 * things it sells. This reads those.
 *
 * **The rule this module is built on: structural text only.** Every term
 * here comes from a position where somebody deliberately named a thing —
 * a menu label, a page title, a heading, a Product node in JSON-LD.
 * Nothing is mined out of body prose. Sliding a window over paragraphs is
 * what produced "tissue polyester", two words adjacent only because the
 * comma between them had been deleted, and confident nonsense is worse
 * than an empty list: it looks deliberate, so nobody checks it.
 *
 * A term's confidence is how many independent places agreed on it. One
 * mention in one h2 is a guess. The same phrase in the nav, in a page
 * title and in that page's h1 is the site telling you three times.
 */

import { guardedFetch } from "./url-guard";
import { isInfrastructureUrl } from "./infrastructure-urls";

/** Where a term was found. Ranked by how deliberate the naming is. */
export type VocabSource =
  | "product_schema"
  | "nav"
  | "page_title"
  | "h1"
  | "heading";

export type VocabularyTerm = {
  /** Lowercase, normalised. */
  term: string;
  /** Every distinct place the site said it. */
  sources: VocabSource[];
  /** How many distinct pages carried it. */
  pages: number;
  /** 0-100. Above 50 means more than one part of the site agreed. */
  confidence: number;
};

export type SiteVocabulary = {
  /** Pages fetched successfully, homepage included. */
  pagesRead: number;
  /** The URLs actually read, for provenance. */
  urlsRead: string[];
  /** Most confident first. */
  terms: VocabularyTerm[];
  /**
   * The homepage's own `<title>` and meta description, verbatim.
   *
   * Kept raw and separate from `terms` because it answers a different
   * question. A term has to be something a person would type; this has
   * to be what the business says it is, and the two are not the same
   * string. "Prateek Tapes — Adhesive Tape Manufacturer India Since
   * 1987" is six words past the product-name limit and gets no term out
   * of it, yet it is the clearest statement on the site that this is a
   * manufacturer and not a shop — which decides whether "near me"
   * belongs in the seeds at all.
   */
  selfDescription: string | null;
  /** Brand words, already excluded from `terms`, returned so callers can too. */
  brandWords: string[];
  /** Set when the read produced nothing useful, and why. */
  note?: string;
};

export type ReadOptions = {
  /** Pages to read beyond the homepage. */
  maxPages?: number;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Whole-read budget. Stops fetching when exceeded, keeps what it has. */
  budgetMs?: number;
  /** Client name, so the brand can be kept out of the vocabulary. */
  brand?: string | null;
  /** Injected in tests so the parsing is testable without a network. */
  fetchPage?: (url: string) => Promise<{ url: string; html: string } | null>;
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

/**
 * Menu entries that exist on every site and name nothing it sells.
 *
 * Left in, they become seeds: "contact us", "privacy policy" and "home"
 * were the three highest-confidence terms on the first run, because they
 * appear in the nav of every page.
 */
const CHROME = new Set([
  "home", "homepage", "about", "about us", "contact", "contact us",
  "contact me", "blog", "news", "careers", "jobs", "privacy",
  "privacy policy", "terms", "terms of service", "terms and conditions",
  "faq", "faqs", "login", "log in", "sign in", "sign up", "register",
  "cart", "basket", "checkout", "my account", "account", "search",
  "sitemap", "gallery", "testimonials", "reviews", "our team", "team",
  "portfolio", "clients", "partners", "menu", "close", "skip to content",
  "read more", "learn more", "click here", "view all", "see all",
  "shop now", "get a quote", "request a quote", "enquire now", "enquiry",
  "get in touch", "book now", "subscribe", "newsletter", "follow us",
  "contact information", "quick links", "useful links", "navigation",
  "copyright", "all rights reserved", "back to top", "next", "previous",
  "download", "downloads", "support", "help", "resources", "pricing",
  "plans", "events", "media", "press", "awards", "certifications",
  "infrastructure", "quality", "quality policy", "our story", "history",
  "why us", "why choose us", "services", "products", "our products",
  "our services", "welcome",
  // Found on the real sites this was first run against.
  "catalogue", "catalog", "download catalogue", "download brochure",
  "brochure", "certificates", "enquiry form", "our clients", "our work",
  "case studies", "projects", "work with us", "apply now", "view more",
  "shop", "store", "get quote", "quote", "offers", "deals", "sale",
]);

/**
 * Words that make a phrase a sentence rather than the name of a thing.
 *
 * An h1 is often a headline — "We deliver quality you can trust" — and a
 * headline is not a search. The same guard the product-list reader uses,
 * for the same reason.
 */
const NOT_A_THING =
  /\b(we|our|us|your|you|they|their|is|are|was|were|will|can|should|welcome|discover|explore|introducing|why|how|what|when|the best|leading|trusted|premier)\b/i;

/**
 * Below this, a term was seen in one place on one page — a guess.
 *
 * Shared by the seed builder and by the "found nothing" note, because
 * they have to agree: a vocabulary whose every term is below the floor
 * produces no seeds, and reporting that as a successful read is how a
 * client silently ends up with no keywords.
 */
export const SEED_CONFIDENCE_FLOOR = 45;

/** Terms shorter than this are too generic to seed anything. */
const MIN_TERM_LEN = 3;
/** Beyond five words it is a sentence, not a product name. */
const MAX_TERM_WORDS = 5;

/**
 * Path segments that are never about what the business sells.
 *
 * Matched a whole segment at a time, not as a substring. A first
 * attempt used a substring match and had to choose between catching
 * "/privacy-policy" and not catching "/products/cart-liner" — an
 * anchored segment match gets both right.
 */
const SKIP_SEGMENT =
  /^(cart|checkout|basket|login|signin|sign-in|register|account|my-account|wp-admin|wp-login|feed|rss|search|thank-you|404|cookies?)$/i;

/** Policy pages, whose segment usually carries a suffix. */
const SKIP_POLICY =
  /^(privacy|terms|cookie|disclaimer|refund|shipping|returns?|legal)(-[a-z0-9]+)*$/i;

/**
 * Pages that name somebody else's business.
 *
 * Found by running this against a real agency. Nine of the thirteen
 * pages read were portfolio entries, so the two highest-confidence terms
 * on the whole site were "bravo pizza nyc" and "anahat exclusive" — two
 * of its clients. Seeded into autocomplete those return keywords about a
 * pizza restaurant in New York, which is the same failure as seeding on
 * the brand name, just better disguised: structurally confident, and
 * about a different company.
 *
 * Skipping them left room for /website-development, /seo-services and
 * /digital-marketing, which is what the agency actually sells.
 */
const SKIP_SHOWCASE =
  /^(portfolio|portfolio-category|portfolios|case-stud(y|ies)|projects?|our-work|work|testimonials?|clients?|customers?|team|our-team|blog|news|press|events?)$/i;

function isSkippablePath(pathname: string): boolean {
  return pathname
    .split("/")
    .filter(Boolean)
    // "/wp-login.php" and "/cart.html" are the same segment as
    // "/wp-login" and "/cart", and plenty of the PHP sites this tool is
    // aimed at write them the first way.
    .map((seg) => seg.replace(/\.(php|html?|aspx?|jsp)$/i, ""))
    .some(
      (seg) =>
        SKIP_SEGMENT.test(seg) ||
        SKIP_POLICY.test(seg) ||
        SKIP_SHOWCASE.test(seg),
    );
}

/** File extensions that are not HTML. */
const NOT_HTML = /\.(jpe?g|png|gif|svg|webp|avif|pdf|docx?|xlsx?|zip|mp4|mp3|css|js|xml|json|ico)$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-");
}

/** Tags out, entities decoded, whitespace collapsed. */
function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What to strip out of a term because it names the company, not a
 * product.
 *
 * The distinction matters more than it looks. A first version treated
 * every word of the client name as a brand word and stripped it
 * wherever it appeared, which on "Prateek Tapes" turned the nav label
 * "BOPP Tapes" into "bopp" — it deleted the head noun of the entire
 * product range, because the company is named after what it makes.
 * Company names are overwhelmingly "Distinctive + Category": Prateek
 * Tapes, Acme Fasteners, Dice Codes. The category half belongs to the
 * products and has to stay.
 */
export type BrandFilter = {
  /** Removed wherever they appear: the full name, the domain label. */
  phrases: string[];
  /** A term made only of these is the company, not a product. */
  distinctive: Set<string>;
};

/**
 * Host labels that identify nobody.
 *
 * Not a complete public-suffix list and does not need to be: the cost of
 * missing one is a brand word that is also a real product word being
 * kept, and the cost of a false positive is a genuine brand not being
 * filtered. Both are survivable; a dependency on a 10,000-entry list
 * that has to stay current is not.
 */
const PUBLIC_SUFFIX =
  /^(com|net|org|edu|gov|mil|int|io|co|in|uk|us|au|ca|nz|de|fr|es|it|nl|be|se|no|dk|fi|pl|pt|gr|cz|ru|ua|tr|jp|cn|kr|hk|tw|sg|my|th|id|ph|vn|br|mx|ar|cl|za|ng|ke|ae|sa|il|info|biz|dev|app|xyz|online|site|store|tech|shop|blog|cloud|www)$/i;

/** Corporate suffixes that are nobody's distinctive word. */
const CORPORATE = new Set([
  "the", "and", "group", "ltd", "limited", "inc", "llc", "plc", "co",
  "corp", "company", "pvt", "private", "industries", "enterprises",
]);

export function brandFilterFor(
  brand: string | null | undefined,
  url: string,
): BrandFilter {
  const phrases: string[] = [];
  const distinctive = new Set<string>();

  const nameWords = (brand ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (nameWords.length > 0) phrases.push(nameWords.join(" "));
  // The first substantial word is the one that identifies this company
  // rather than its trade. Everything after it is usually the category.
  const first = nameWords.find((w) => w.length >= 3 && !CORPORATE.has(w));
  if (first) distinctive.add(first);

  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // The whole host, because some sites use it as their page title
    // verbatim — a staging site titled "d.dicecodes.com" put exactly
    // that string in the product list.
    phrases.push(host);
    // Then every label that is neither a public suffix nor a
    // one-character subdomain. Taking the first label alone read
    // "d.dicecodes.com" as the brand word "d", which is too short to
    // keep, so the real brand was never filtered at all.
    for (const label of host.split(".")) {
      if (label.length >= 3 && !PUBLIC_SUFFIX.test(label)) {
        phrases.push(label);
        distinctive.add(label);
      }
    }
  } catch {
    // A malformed URL contributes no brand words, which is correct.
  }

  // Longest first, so "prateek tapes" is removed before "prateek".
  phrases.sort((a, b) => b.length - a.length);
  return { phrases, distinctive };
}

/**
 * A term, or null when the string is not one.
 *
 * Every rejection here is a term that reached the seed list on an early
 * run and produced wrong keywords, so the list is empirical rather than
 * theoretical.
 */
export function normaliseTerm(raw: string, brand: BrandFilter): string | null {
  let t = decodeEntities(raw)
    .replace(/[®™©]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    // Leading/trailing punctuation rides along on menu labels.
    .replace(/^[^a-z0-9]+|[^a-z0-9%)]+$/g, "")
    .trim();

  if (!t || t.length > 80) return null;
  if (NOT_A_THING.test(t)) return null;
  // A phone number, a price, a year.
  if (!/[a-z]/.test(t)) return null;
  // A model code, not a search.
  //
  // The tape manufacturer gives every model its own page with Product
  // schema on it, so "ptk 700", "ptk 800", "ptk 900", "ptk 910", "ptk
  // 1000" and "ptk 1200" came out as the six most confident terms on the
  // site and crowded the real range out of the seed list. They are
  // confident because the site genuinely says them a lot; nobody
  // searches them. A standalone run of digits is the signature — "48mm
  // bopp tape" keeps its measurement because the digits are attached to
  // a unit.
  if (/(?:^|\s)\d+(?:\s|$)/.test(t)) return null;

  // The company's own name, wherever it sits. "prateek tapes bopp tape"
  // is nobody's search; "bopp tape" is.
  for (const phrase of brand.phrases) {
    if (!phrase) continue;
    t = t
      .split(phrase)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const words = t.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > MAX_TERM_WORDS) return null;
  // What is left is the company's distinctive word and nothing else.
  if (words.every((w) => brand.distinctive.has(w))) return null;

  t = words.join(" ");
  if (t.length < MIN_TERM_LEN || CHROME.has(t)) return null;
  return t;
}

/**
 * How the site describes itself, verbatim: `<title>` plus the meta
 * description.
 *
 * No normalising, no term extraction. Callers use it to judge the
 * business, not to search on it.
 */
export function selfDescriptionOf(html: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const desc =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
    )?.[1];
  const parts = [title, desc]
    .map((s) => (s ? decodeEntities(s).replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(". ") : null;
}

/** The `<title>`, with the brand half discarded. */
export function titleTerm(html: string, brand: BrandFilter): string | null {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!raw) return null;
  // "BOPP Tapes | Prateek Tapes" is two things separated by a pipe, and
  // which half is the brand varies by site — plenty of sites lead with
  // it. So every chunk is tried and the first real term wins, rather
  // than assuming the page name comes first.
  for (const chunk of decodeEntities(raw).split(/\s*[|·—–‒»>]\s*|\s+-\s+/)) {
    const t = normaliseTerm(chunk, brand);
    if (t) return t;
  }
  return null;
}

function headingTerms(
  html: string,
  tag: "h1" | "h2" | "h3",
  brand: BrandFilter,
): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const t = normaliseTerm(textOf(m[1]), brand);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Anchor text from the navigation blocks.
 *
 * The nav is the single best source on any site: it is a taxonomy the
 * owner wrote of their own products, in the words they chose, and it is
 * finite. The fallback below exists because plenty of sites, especially
 * older PHP ones, have no <nav> element at all.
 */
export function navTerms(html: string, brand: BrandFilter): string[] {
  const blocks: string[] = [];
  for (const re of [
    /<nav[^>]*>([\s\S]*?)<\/nav>/gi,
    /<header[^>]*>([\s\S]*?)<\/header>/gi,
    /<[a-z]+[^>]+role=["']navigation["'][^>]*>([\s\S]*?)<\/[a-z]+>/gi,
  ]) {
    for (const m of html.matchAll(re)) blocks.push(m[1]);
  }

  // No nav element. Menus on older sites are a <ul> with "menu" or
  // "nav" in the class, so try that before giving up.
  if (blocks.length === 0) {
    const re = /<ul[^>]*(?:class|id)=["'][^"']*(?:menu|nav)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    for (const m of html.matchAll(re)) blocks.push(m[1]);
  }

  const out: string[] = [];
  for (const block of blocks) {
    for (const a of block.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
      const t = normaliseTerm(textOf(a[1]), brand);
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * Product and Service names from JSON-LD.
 *
 * The highest-confidence source there is, because the site has
 * explicitly declared "this string is the name of a product". Nothing
 * about it is inferred.
 */
export function schemaProductTerms(html: string, brand: BrandFilter): string[] {
  const out: string[] = [];
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const b of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(b[1].trim());
    } catch {
      continue;
    }
    walkJsonLd(parsed, (node) => {
      const t = node["@type"];
      const types = (Array.isArray(t) ? t : [t]).map((x) => String(x ?? ""));
      if (!types.some((x) => /^(Product|Service|Offer|IndividualProduct|ProductModel)$/i.test(x)))
        return;
      const name = node["name"];
      if (typeof name !== "string") return;
      const term = normaliseTerm(name, brand);
      if (term) out.push(term);
    });
  }
  return out;
}

function walkJsonLd(
  value: unknown,
  visit: (node: Record<string, unknown>) => void,
  depth = 0,
): void {
  if (depth > 6 || !value) return;
  if (Array.isArray(value)) {
    for (const v of value) walkJsonLd(v, visit, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  visit(node);
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") walkJsonLd(v, visit, depth + 1);
  }
}

/** Internal, HTML, plausibly about the business. */
export function isWorthReading(href: string, origin: string): boolean {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.origin !== origin) return false;
  if (NOT_HTML.test(u.pathname)) return false;
  if (isSkippablePath(u.pathname)) return false;
  if (isInfrastructureUrl(u.toString())) return false;
  // The homepage is read first and separately.
  if (u.pathname === "/" || u.pathname === "") return false;
  return true;
}

/**
 * The pages most likely to name products, in the order to read them.
 *
 * Nav-linked pages first: the owner put them in the menu, which is a
 * stronger signal than any path heuristic. Then anything whose path
 * suggests a catalogue. A blog post about industry news names nothing
 * the business sells, so it sorts last and usually falls off the end.
 */
export function rankPages(hrefs: string[], navHrefs: Set<string>): string[] {
  const seen = new Set<string>();
  const scored: { url: string; score: number }[] = [];
  for (const href of hrefs) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    u.hash = "";
    u.search = "";
    const key = u.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    let score = 0;
    if (navHrefs.has(key)) score += 50;
    if (/\/(products?|services?|catalogue|catalog|shop|collections?|category|categories|range)\b/i.test(u.pathname))
      score += 30;
    // Depth is a proxy for specificity. /products/bopp-tape names one
    // thing; /products names the set.
    const depth = u.pathname.split("/").filter(Boolean).length;
    score += Math.min(depth, 3) * 5;
    if (/\/(blog|news|article|post|20\d\d)\b/i.test(u.pathname)) score -= 40;
    scored.push({ url: key, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.url);
}

async function defaultFetch(
  url: string,
  timeoutMs: number,
): Promise<{ url: string; html: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await guardedFetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|xml/i.test(type)) return null;
    // Enough for the head and the main content. A page bigger than this
    // is a bundle, and its nav is in the first slice anyway.
    const html = (await res.text()).slice(0, 400_000);
    return { url: res.url || url, html };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Confidence a term names something the business sells. */
function scoreTerm(sources: Set<VocabSource>, pages: number): number {
  const WEIGHT: Record<VocabSource, number> = {
    product_schema: 45,
    nav: 35,
    page_title: 30,
    h1: 30,
    heading: 10,
  };
  let best = 0;
  for (const s of sources) best = Math.max(best, WEIGHT[s]);
  // Agreement is the whole point. A term in the nav AND in a page title
  // AND in that page's h1 is the site saying it three times, in three
  // places it had to write separately.
  const agreement = (sources.size - 1) * 18;
  const spread = Math.min(pages - 1, 3) * 6;
  return Math.min(100, best + agreement + spread);
}

/**
 * Read a site and return the words it uses for the things it sells.
 *
 * Never throws and never guesses. An unreachable site, a JS-only SPA
 * with an empty body, or a one-page brochure with no headings all return
 * an empty `terms` with a `note` saying so, and the caller falls back to
 * what it did before. That is the honest outcome and the caller can say
 * it out loud.
 */
export async function readSiteVocabulary(
  startUrl: string,
  opts: ReadOptions = {},
): Promise<SiteVocabulary> {
  const maxPages = opts.maxPages ?? 12;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  const budgetMs = opts.budgetMs ?? 45_000;
  const started = Date.now();
  const fetchOne =
    opts.fetchPage ?? ((u: string) => defaultFetch(u, timeoutMs));

  const url = /^https?:\/\//i.test(startUrl) ? startUrl : `https://${startUrl}`;
  const brandWords = brandFilterFor(opts.brand, url);
  const brandWordList = Array.from(brandWords.distinctive);

  const empty = (note: string): SiteVocabulary => ({
    pagesRead: 0,
    urlsRead: [],
    selfDescription: null,
    terms: [],
    brandWords: brandWordList,
    note,
  });

  const home = await fetchOne(url);
  if (!home) return empty("the site could not be read");

  let origin: string;
  try {
    origin = new URL(home.url).origin;
  } catch {
    return empty("the site returned an address that could not be parsed");
  }

  // term → sources, and the pages that carried it
  const found = new Map<string, { sources: Set<VocabSource>; pages: Set<string> }>();
  const record = (term: string, source: VocabSource, page: string) => {
    let e = found.get(term);
    if (!e) {
      e = { sources: new Set(), pages: new Set() };
      found.set(term, e);
    }
    e.sources.add(source);
    e.pages.add(page);
  };

  const harvest = (html: string, pageUrl: string, isHome: boolean) => {
    for (const t of schemaProductTerms(html, brandWords))
      record(t, "product_schema", pageUrl);
    // The nav is the same on every page, so reading it once is enough
    // and reading it repeatedly would inflate the page count that
    // confidence is partly built on.
    if (isHome) for (const t of navTerms(html, brandWords)) record(t, "nav", pageUrl);
    const title = titleTerm(html, brandWords);
    if (title) record(title, "page_title", pageUrl);
    for (const t of headingTerms(html, "h1", brandWords)) record(t, "h1", pageUrl);
    for (const t of headingTerms(html, "h2", brandWords)) record(t, "heading", pageUrl);
    for (const t of headingTerms(html, "h3", brandWords)) record(t, "heading", pageUrl);
  };

  harvest(home.html, home.url, true);

  // Which pages the nav points at, so they can be read first.
  const navHrefs = new Set<string>();
  for (const block of [home.html]) {
    for (const m of block.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/gi)) {
      for (const a of m[1].matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
        try {
          const u = new URL(a[1], home.url);
          u.hash = "";
          u.search = "";
          navHrefs.add(u.toString());
        } catch {
          // A malformed href is simply not a nav target.
        }
      }
    }
  }

  const allHrefs: string[] = [];
  for (const m of home.html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    try {
      allHrefs.push(new URL(m[1], home.url).toString());
    } catch {
      continue;
    }
  }
  const candidates = rankPages(
    allHrefs.filter((h) => isWorthReading(h, origin)),
    navHrefs,
  ).slice(0, maxPages);

  const urlsRead = [home.url];
  // Four at a time: enough to keep a 12-page read inside ten seconds,
  // few enough that a small shared host is not knocked over by its own
  // SEO tool.
  const CONCURRENCY = 4;
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() - started > budgetMs) return;
      const i = cursor++;
      if (i >= candidates.length) return;
      const page = await fetchOne(candidates[i]);
      if (!page) continue;
      urlsRead.push(page.url);
      harvest(page.html, page.url, false);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker),
  );

  const terms: VocabularyTerm[] = Array.from(found.entries())
    .map(([term, e]) => ({
      term,
      sources: Array.from(e.sources),
      pages: e.pages.size,
      confidence: scoreTerm(e.sources, e.pages.size),
    }))
    .sort((a, b) => b.confidence - a.confidence || a.term.localeCompare(b.term));

  // "Read it and found nothing" has to mean nothing worth acting on,
  // not nothing at all. A JS-only page yields a single term from its
  // `<title>` — "App" — which no caller would ever seed on, and calling
  // that a successful read is how a client silently gets no keywords
  // while the UI says everything went fine.
  const usable = terms.filter((t) => t.confidence >= SEED_CONFIDENCE_FLOOR);

  return {
    pagesRead: urlsRead.length,
    urlsRead,
    selfDescription: selfDescriptionOf(home.html),
    terms,
    brandWords: brandWordList,
    note:
      usable.length === 0
        ? "the site was read but named nothing it sells in its navigation, titles or headings"
        : undefined,
  };
}

/**
 * Seeds for keyword discovery, from the vocabulary.
 *
 * The floor matters more than the ceiling. A term seen in one h2 on one
 * page is a guess, and a guess fed to autocomplete returns twenty
 * confident keywords about the wrong business. Only terms more than one
 * part of the site agreed on get through.
 */
/**
 * A known cost of the floor, kept deliberately.
 *
 * A nav label seen once scores below it, so on the tape manufacturer
 * "masking tapes", "polyester tape" and "foam tape" — all real products
 * — do not become seeds, while the four the site names in both its
 * headings and its Product schema do. Lowering the floor to admit them
 * also admits "bopp packaging hot" and "kraft paper eco", which are menu
 * labels with a badge glued on, and those would outrank the real terms
 * on a tie. Four correct seeds fan out through autocomplete into the
 * adjacent range anyway; four correct seeds plus four wrong ones do not.
 */
export function vocabularySeeds(
  vocab: SiteVocabulary,
  opts: { limit?: number; minConfidence?: number } = {},
): string[] {
  const limit = opts.limit ?? 8;
  const min = opts.minConfidence ?? SEED_CONFIDENCE_FLOOR;
  return vocab.terms
    .filter((t) => t.confidence >= min)
    .map((t) => t.term)
    .slice(0, limit);
}
