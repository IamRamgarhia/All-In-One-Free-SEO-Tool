/**
 * Central glossary of technical SEO terms used throughout the app.
 * Plain-language definitions that match CLAUDE.md Part 3.4 ("Plain-language UX").
 *
 * Lookup is case-insensitive on the keys.
 */
export type Definition = {
  short: string;
  why?: string;
};

import { GLOSSARY_FR } from "./glossary.fr";

const dict: Record<string, Definition> = {
  // Tags & markup
  "title tag": {
    short: "The clickable headline of your search result.",
    why: "Strongest on-page signal Google has about what a page is about. Aim for 50–60 characters.",
  },
  title: {
    short: "The clickable headline of your search result.",
    why: "Aim for 50–60 characters with the primary keyword near the start.",
  },
  "meta description": {
    short: "The summary text shown under the title in search results.",
    why: "Not a direct ranking factor, but heavily influences click-through rate. 120–155 chars.",
  },
  canonical: {
    short:
      "A signal to Google about the main version of this page when similar pages exist.",
    why: "Without one, Google guesses which URL is the 'real' one and can split your ranking signals.",
  },
  viewport: {
    short:
      "Tells mobile browsers how to scale the page so it renders correctly on phones.",
    why: "Without it, your site looks broken on mobile — and Google now indexes mobile-first.",
  },
  schema: {
    short: "Structured data (JSON-LD) that tells Google what your page is about.",
    why: "Unlocks rich results — review stars, FAQs, product info — directly improving CTR.",
  },
  "json-ld": {
    short: "JSON-LD is the recommended format for schema markup.",
    why: "It lives in a <script type='application/ld+json'> tag and doesn't affect rendered HTML.",
  },
  hreflang: {
    short: "A tag that tells Google which language/region a page targets.",
    why: "Critical for multi-region sites — without it Google may show the wrong language to a user.",
  },
  noindex: {
    short:
      "A directive telling Google not to include this page in search results.",
    why: "Right setting for staging, login pages, and thank-you pages. Wrong setting almost everywhere else.",
  },
  "open graph": {
    short: "Tags that control how your page looks when shared on social media.",
    why: "No OG tags = unbranded preview cards on Slack/LinkedIn/Facebook.",
  },
  "robots.txt": {
    short:
      "A file at the root of your site telling crawlers what they can and can't crawl.",
    why: "Misconfigured robots.txt can de-index your whole site. Sitemap link goes here too.",
  },
  sitemap: {
    short: "An XML file listing all the URLs you want Google to know about.",
    why: "Helps Google discover pages faster, especially on big sites or new pages.",
  },

  // Performance
  "core web vitals": {
    short: "Google's three metrics for page experience: LCP, INP, CLS.",
    why: "Failing these hurts rankings and conversions on commercial pages.",
  },
  lcp: {
    short: "Largest Contentful Paint — how long until the main content renders.",
    why: "Aim for under 2.5s. Usually fixed by optimizing the hero image.",
  },
  inp: {
    short:
      "Interaction to Next Paint — how responsive your page feels when clicked.",
    why: "Aim for under 200ms. Heavy JavaScript is the most common cause of bad INP.",
  },
  cls: {
    short:
      "Cumulative Layout Shift — how much your page jumps around as it loads.",
    why: "Aim for under 0.1. Usually caused by images without dimensions or late-loading ads.",
  },
  hsts: {
    short:
      "HTTP Strict Transport Security — header that forces HTTPS for repeat visitors.",
    why: "Defends against downgrade attacks. Easy security win.",
  },
  csp: {
    short:
      "Content Security Policy — header that limits which scripts/styles can load.",
    why: "Defends against XSS. Hardest security header to add but the most valuable.",
  },

  // Concepts
  "e-e-a-t": {
    short:
      "Experience, Expertise, Authoritativeness, Trustworthiness — Google's quality framework.",
    why: "Real authors with real credentials beat anonymous AI-generated content, especially for YMYL.",
  },
  "long-tail": {
    short:
      "Specific, multi-word keywords with lower volume but much higher intent.",
    why: "'best running shoes for flat feet' beats 'shoes' for a niche site.",
  },
  cannibalization: {
    short:
      "When multiple pages on your site compete for the same keyword.",
    why: "Google can't decide which page to rank, so all of them rank worse than one focused page would.",
  },
  "striking distance": {
    short: "Keywords currently ranking in positions 4–15.",
    why: "Highest-ROI keywords to optimize — small changes move you to page 1 where almost all clicks happen.",
  },
  "content decay": {
    short: "When a previously-ranking page loses traffic over time.",
    why: "Refreshing decaying content recovers traffic at a fraction of the cost of new posts.",
  },
  "topic cluster": {
    short:
      "A pillar page covering a broad topic, plus supporting articles linked back to it.",
    why: "Demonstrates topical authority — a major signal after the helpful-content updates.",
  },
  "people also ask": {
    short:
      "The expandable question boxes Google shows in search results.",
    why: "Each question is a high-value content idea — answer them on your page to potentially rank.",
  },
  paa: {
    short: "People Also Ask — the question boxes Google shows in search results.",
    why: "Each question is a high-value content idea.",
  },
  serp: {
    short:
      "Search Engine Results Page — the page Google returns for a query.",
    why: "Modern SERPs include ads, AI Overviews, PAA, image carousels — not just blue links.",
  },
  "ai overview": {
    short:
      "Google's AI-generated answer that appears at the top of some search results.",
    why: "Now appears on 47% of commercial queries. Reduces clicks to traditional results.",
  },

  // Search intent
  informational: {
    short:
      "Search intent: the user wants to learn or understand something.",
    why: "Match with how-tos, guides, definitions. Avoid pushing for sale.",
  },
  commercial: {
    short:
      "Search intent: the user is researching before a purchase decision.",
    why: "Match with comparisons, reviews, 'best of' content.",
  },
  transactional: {
    short: "Search intent: the user is ready to buy or take an action.",
    why: "Match with product pages, pricing, signup flows. Highest converting intent.",
  },
  navigational: {
    short: "Search intent: the user is looking for a specific site or brand.",
    why: "Make sure your homepage and key pages rank for your own brand name.",
  },

  // Authority
  "domain authority": {
    short:
      "A 0–100 score estimating how likely a site is to rank, based on its backlink profile.",
    why: "Created by Moz; not a Google metric. Useful as a rough proxy for site strength.",
  },
  da: {
    short:
      "Domain Authority — a 0–100 score estimating how likely a site is to rank.",
    why: "Useful as a rough proxy. Not a Google metric.",
  },
  dr: {
    short:
      "Domain Rating — Ahrefs' equivalent of Domain Authority, 0–100 scale.",
    why: "Same idea — proxy for site link strength based on backlink profile.",
  },

  // Backlinks
  backlink: {
    short: "A link from another site to yours.",
    why: "Still one of the top ranking factors. Quality > quantity.",
  },
  disavow: {
    short:
      "Telling Google to ignore certain backlinks when assessing your site.",
    why: "Used to defend against bad-link attacks. Use sparingly — Google ignores most spam links automatically now.",
  },

  // SEO tools
  gsc: {
    short:
      "Google Search Console — Google's free tool for monitoring your site in search.",
    why: "Free clicks, impressions, queries, indexing data. Connect every site you own.",
  },
  ga4: {
    short: "Google Analytics 4 — the latest version of Google Analytics.",
    why: "Tracks behavior, conversions, traffic sources. Free.",
  },
  ctr: {
    short:
      "Click-through rate — clicks ÷ impressions. The % of people who clicked your result after seeing it.",
    why: "Low CTR at a good position usually means a weak title or meta description. Easy to test and improve.",
  },
  impression: {
    short:
      "An impression is one time your site appeared in someone's search results, whether they clicked or not.",
  },
  position: {
    short:
      "Average rank in search results for a query. Position 1 is the top organic result.",
    why: "Position 1 ≈ 32% CTR, position 5 ≈ 5%, position 10 ≈ 3%. Worth fighting for top 3.",
  },
  "core-web-vitals": {
    short:
      "Google's three speed/UX metrics: LCP (loading), INP (responsiveness), CLS (stability).",
    why: "Confirmed ranking signals since 2021. PageSpeed Insights measures all three free.",
  },
  cwv: {
    short:
      "Core Web Vitals — Google's three speed/UX metrics: LCP, INP, CLS.",
  },
  "structured-data": {
    short:
      "Tags that tell Google what your page is about (recipe, product, FAQ, article…) so it can show rich results.",
    why: "Adds star ratings, prices, FAQs to your search snippet. Higher CTR.",
  },
  "rich-result": {
    short:
      "An enhanced search snippet (with stars, prices, images, etc.) earned via structured data.",
  },
  e_e_a_t: {
    short:
      "Experience, Expertise, Authoritativeness, Trustworthiness — Google's quality framework for evaluating content.",
    why: "Especially critical for medical/financial/legal content (YMYL). Real authors with credentials win.",
  },
  ymyl: {
    short:
      "Your Money or Your Life — content categories where bad advice can hurt people (health, finance, legal).",
    why: "Google holds YMYL content to a higher quality bar. E-E-A-T matters more here.",
  },
  helpful_content: {
    short:
      "Google's framework rewarding content written for people first, not search engines.",
    why: "Helpful Content updates demote thin, AI-spammy, or affiliate-stuffed pages site-wide.",
  },
  "internal-link": {
    short: "A link from one page on your site to another page on your site.",
    why: "Distributes ranking power between your pages, helps Google find new content.",
  },
  "external-link": {
    short: "A link from your site to someone else's site.",
  },
  anchor: {
    short:
      "Anchor text — the clickable words of a hyperlink. Tells Google what the linked page is about.",
    why: "Descriptive anchors (\"best espresso machines\") beat generic ones (\"click here\").",
  },
  "robots-txt": {
    short:
      "A text file at /robots.txt that tells crawlers which paths they can or can't fetch.",
    why: "A wrong rule can deindex your whole site. Always test before pushing changes.",
  },
  "ai-overview": {
    short:
      "AI Overviews — the AI-generated answers that appear above search results.",
    why: "Cite-worthy chunked content (lists, definitions, direct answers) is more likely to be sourced.",
  },
  llms_txt: {
    short:
      "A new proposed standard at /llms.txt — tells AI assistants what your site is about and what to read.",
    why: "Early days. Adopting it is cheap insurance for AI-search visibility.",
  },
  "topical-authority": {
    short:
      "How comprehensively you cover a topic. Built by publishing many related pieces under one theme.",
    why: "Sites with deep topical coverage outrank one-off competitors on the same keywords.",
  },
  "striking-distance": {
    short:
      "Keywords ranking on positions 4-15 with meaningful impressions — small content tweaks often push them to page 1.",
    why: "Cheapest ranking wins. Always work this list before chasing brand-new keywords.",
  },
  "content-decay": {
    short:
      "Pages that used to rank well but are losing traffic over time.",
    why: "Refreshing existing pages is 5-10× faster than ranking new ones, and Google rewards freshness signals.",
  },
  "page-experience": {
    short:
      "Google's umbrella term for usability signals: CWV, mobile-friendliness, HTTPS, no intrusive interstitials.",
  },
  redirect: {
    short:
      "When a URL forwards visitors to a different URL. 301 = permanent (preferred for SEO), 302 = temporary.",
    why: "Long redirect chains (>1 hop) waste crawl budget and slow users down.",
  },
  "crawl-budget": {
    short:
      "How many pages Google will crawl on your site per day. Bigger sites with more authority get bigger budgets.",
    why: "Wasting budget on dead pages, redirects, or junk URLs means new content gets indexed slower.",
  },
};

const lookup = new Map<string, Definition>();
for (const [k, v] of Object.entries(dict)) {
  lookup.set(k.toLowerCase(), v);
}
const lookupFr = new Map<string, Definition>();
for (const [k, v] of Object.entries(GLOSSARY_FR)) {
  lookupFr.set(k.toLowerCase(), v);
}

/** The glossary's keys, for the French table's coverage test. */
export const GLOSSARY_KEYS: readonly string[] = Object.keys(dict);

/** A term's definition in the reader's language (French: glossary.fr.ts). */
export function lookupTerm(term: string, locale = "en"): Definition | null {
  const key = term.toLowerCase();
  if (locale === "fr") return lookupFr.get(key) ?? lookup.get(key) ?? null;
  return lookup.get(key) ?? null;
}

export function allTerms(): { term: string; definition: Definition }[] {
  return Array.from(lookup.entries()).map(([term, definition]) => ({
    term,
    definition,
  }));
}
