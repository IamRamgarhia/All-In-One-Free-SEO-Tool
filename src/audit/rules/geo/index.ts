import { defineRule, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Anthropic",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
  "Bytespider",
];

export const semanticHtmlRule = defineRule({
  id: "geo-semantic-html",
  category: "geo",
  severity: "low",
  weight: 6,
  title: "Semantic HTML landmarks",
  description: "Semantic elements help AI/crawler comprehension",
  recommendation: "Prefer article/section/nav/aside over generic div soup.",
  check: async ({ $ }) => {
    const semantic =
      $("article,section,nav,aside,main,header,footer").length;
    const divs = $("div").length || 1;
    const ratio = semantic / divs;
    if (semantic >= 4 || ratio >= 0.05) {
      return pass(`Semantic elements: ${semantic}`);
    }
    return warn(`Few semantic elements (${semantic}) vs divs (${divs})`);
  },
});

export const contentStructureRule = defineRule({
  id: "geo-content-structure",
  category: "geo",
  severity: "low",
  weight: 5,
  title: "Clear content structure",
  description: "Headings + lists/paragraphs aid AI extraction",
  recommendation: "Structure content with clear headings, lists, and paragraphs.",
  check: async ({ $ }) => {
    const headings = $("h1,h2,h3").length;
    const lists = $("ul,ol").length;
    const paras = $("p").length;
    if (headings >= 2 && (lists > 0 || paras >= 3)) {
      return pass("Content structure looks clear");
    }
    return warn("Weak heading/list/paragraph structure", {
      headings,
      lists,
      paras,
    });
  },
});

export const aiBotAccessRule = defineRule({
  id: "geo-ai-bot-access",
  category: "geo",
  severity: "medium",
  weight: 10,
  title: "AI bots not blanket-blocked",
  description: "Disallowing all major AI crawlers hides you from AI answers",
  recommendation: "Allow GPTBot/Claude/Perplexity in robots.txt if AI visibility matters.",
  check: async ({ crawl }) => {
    const robots = crawl?.robotsTxt ?? "";
    if (!robots) return pass("No robots.txt — AI bots unrestricted by default");
    const chunks = robots.split(/(?=user-agent:)/i);
    const blocked = AI_BOTS.filter((bot) =>
      chunks.some((chunk) => {
        if (!new RegExp(`user-agent:\\s*${bot}\\b`, "i").test(chunk)) return false;
        return /^disallow:\s*\/\s*$/im.test(chunk);
      }),
    );
    if (blocked.length >= 3) {
      return warn(`Multiple AI bots disallowed: ${blocked.join(", ")}`, { blocked });
    }
    if (blocked.length > 0) {
      return warn(`AI bot(s) disallowed: ${blocked.join(", ")}`, { blocked });
    }
    return pass("No blanket AI-bot Disallow detected");
  },
});

export const llmsTxtRule = defineRule({
  id: "geo-llms-txt",
  category: "geo",
  severity: "low",
  weight: 8,
  title: "llms.txt hint",
  description: "/llms.txt helps AI systems understand the site",
  recommendation: "Publish /llms.txt with AI-friendly site guidance.",
  check: async ({ site }) => {
    try {
      const origin = new URL(site.url).origin;
      const res = await fetch(`${origin}/llms.txt`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "SeoToolAuditBot/1.0" },
      });
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        const text = await res.text();
        if (/text\/html/i.test(ct) && /<html/i.test(text)) {
          return warn("/llms.txt returned HTML fallback");
        }
        if (text.trim().length < 20) return warn("/llms.txt is empty");
        return pass("/llms.txt present");
      }
      return warn(`/llms.txt not found (${res.status})`);
    } catch {
      return warn("Could not fetch /llms.txt");
    }
  },
});

export const schemaDriftRule = defineRule({
  id: "geo-schema-drift",
  category: "geo",
  severity: "medium",
  weight: 7,
  title: "Schema vs visible title alignment",
  description: "JSON-LD headline/name should relate to the page title",
  recommendation: "Keep structured data aligned with visible content.",
  check: async ({ $, page }) => {
    const title = (page.title ?? "").toLowerCase();
    const ld = $('script[type="application/ld+json"]').text();
    if (!ld || !title) return pass("No schema/title to compare");
    try {
      const parsed = JSON.parse(ld.startsWith("[") ? ld : ld);
      const blob = JSON.stringify(parsed).toLowerCase();
      // Soft: if schema has a name/headline, check overlap of a title token
      const token = title.split(/\s+/).filter((t) => t.length > 4)[0];
      if (!token) return pass("Title too short to compare");
      if (/headline|name/.test(blob) && !blob.includes(token)) {
        return warn("Schema name/headline may drift from page title");
      }
      return pass("No obvious schema/title drift");
    } catch {
      return pass("Schema parse issues handled by schema rules");
    }
  },
});

export const agentsMdRule = defineRule({
  id: "geo-agents-md",
  category: "geo",
  severity: "info",
  weight: 3,
  title: "AGENTS.md optional",
  description: "/AGENTS.md can guide autonomous agents",
  recommendation: "Publish /AGENTS.md as text/Markdown when useful.",
  check: async ({ site }) => {
    try {
      const origin = new URL(site.url).origin;
      const res = await fetch(`${origin}/AGENTS.md`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "SeoToolAuditBot/1.0" },
      });
      if (!res.ok) return pass("No AGENTS.md (optional)");
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (/text\/html/i.test(ct) && /<html/i.test(text)) {
        return warn("/AGENTS.md returned HTML fallback");
      }
      return pass("/AGENTS.md present");
    } catch {
      return pass("AGENTS.md check skipped");
    }
  },
});

const GEO_RULES = [
  semanticHtmlRule,
  contentStructureRule,
  aiBotAccessRule,
  llmsTxtRule,
  schemaDriftRule,
  agentsMdRule,
];

export function registerGeoRules(): void {
  for (const rule of GEO_RULES) registerRule(rule);
}

export { GEO_RULES };
