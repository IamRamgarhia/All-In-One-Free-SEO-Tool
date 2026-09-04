"use server";

import { like, or, eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  clients,
  competitors,
  invoices,
  keywords,
  outreachContacts,
  seoResources,
  tasks,
} from "@/db/schema";

export type SearchHit = {
  type:
    | "client"
    | "task"
    | "keyword"
    | "audit"
    | "competitor"
    | "brief"
    | "outreach"
    | "invoice"
    | "resource"
    | "tool";
  id: number;
  href: string;
  title: string;
  subtitle?: string;
};

// Static tool index — fast to filter, no DB roundtrip. Keep in sync with
// /src/app/tools/page.tsx.
const TOOL_INDEX: Array<{
  href: string;
  title: string;
  subtitle: string;
  keywords: string;
}> = [
  { href: "/tools/code-generator", title: "Code generator (plugins/HTML/.htaccess)", subtitle: "WP plugin, Elementor HTML, Shopify Liquid, schema, Next.js…", keywords: "wordpress plugin htaccess shopify liquid schema nextjs code ai" },
  { href: "/tools/meta-tag-generator", title: "Meta tag generator", subtitle: "3 title + description options with SERP preview + OG tags", keywords: "meta title description og open graph seo" },
  { href: "/tools/pixel-preview", title: "Pixel preview (SERP simulator)", subtitle: "Title + meta preview at Google's exact pixel widths", keywords: "serp simulator preview title meta pixel" },
  { href: "/tools/rank-where", title: "Rank where (country-aware)", subtitle: "Find your position on Google for any keyword + country", keywords: "rank tracker position serp google country" },
  { href: "/tools/wp-hack-scan", title: "WordPress hack scan", subtitle: "Malware / backdoor probes + Cloudflare Under Attack quick fix", keywords: "wordpress malware hack security backdoor cloudflare" },
  { href: "/tools/local-cwv", title: "Core Web Vitals", subtitle: "LCP / CLS / INP measurement", keywords: "core web vitals lcp cls inp performance speed" },
  { href: "/tools/serp-features", title: "SERP feature tracker", subtitle: "AI Overview, Featured Snippet, Local Pack, PAA presence", keywords: "serp features ai overview snippet local pack paa" },
  { href: "/tools/ai-overview", title: "AI Overview readiness", subtitle: "Score for AI Overview citation likelihood", keywords: "ai overview aio google sge generative experience" },
  { href: "/tools/eeat-audit", title: "E-E-A-T audit", subtitle: "Experience / Expertise / Authority / Trust scoring", keywords: "eeat trust authority experience expertise" },
  { href: "/tools/geo-score", title: "GEO composite score", subtitle: "Generative Engine Optimization across 6 dimensions", keywords: "geo aeo generative engine optimization ai" },
  { href: "/tools/health-check", title: "Single-page health check", subtitle: "Full SEO + CWV audit for one URL", keywords: "health check audit single page seo full" },
  { href: "/tools/sxo", title: "SXO audit", subtitle: "Search experience + UX + intent satisfaction scoring", keywords: "sxo search experience ux intent" },
  { href: "/tools/schema", title: "Schema generator", subtitle: "AI-generated schema.org JSON-LD", keywords: "schema json-ld structured data" },
  { href: "/tools/schema-validate", title: "Schema validator", subtitle: "Validate JSON-LD on any URL", keywords: "schema validator json-ld structured" },
  { href: "/tools/ai-schema", title: "AI schema generator", subtitle: "Schema with AI fill-in", keywords: "ai schema json-ld" },
  { href: "/tools/person-schema", title: "Person schema builder", subtitle: "E-E-A-T-ready Person JSON-LD", keywords: "person schema author bio" },
  { href: "/tools/aio-passage", title: "AIO passage writer", subtitle: "134-167 word self-contained passages for AI Overview citation", keywords: "aio passage ai overview citation" },
  { href: "/tools/ai-citation-tactics", title: "AI citation tactics", subtitle: "Get cited in LLM answers — concrete tactics", keywords: "llm citation chatgpt claude perplexity" },
  { href: "/tools/reputation-abuse-risk", title: "Reputation abuse policy risk", subtitle: "Google reputation-abuse policy compliance check", keywords: "reputation abuse policy google" },
  { href: "/tools/intent-classifier", title: "Search intent classifier", subtitle: "informational / commercial / transactional / navigational", keywords: "intent classifier serp commercial transactional informational" },
  { href: "/tools/keyword-difficulty", title: "Keyword difficulty", subtitle: "Free DA-weighted difficulty estimator", keywords: "keyword difficulty kd da" },
  { href: "/tools/search-volume", title: "Search volume estimator", subtitle: "Free bulk search volume estimator", keywords: "search volume bulk estimator keyword" },
  { href: "/tools/cluster", title: "Keyword cluster builder", subtitle: "Group keywords by topic + intent", keywords: "cluster keyword topic group" },
  { href: "/tools/internal-linking", title: "Internal linking opportunities", subtitle: "Find existing pages that should link to target", keywords: "internal links linking opportunities" },
  { href: "/tools/link-recommender", title: "AI internal-link recommender", subtitle: "AI suggests internal links for any content", keywords: "internal link ai recommender" },
  { href: "/tools/link-graph", title: "Internal link graph", subtitle: "Visualize site's link structure", keywords: "link graph visualization internal" },
  { href: "/tools/pagerank", title: "Internal PageRank", subtitle: "Distribute authority across your pages", keywords: "pagerank internal authority" },
  { href: "/tools/auto-link", title: "Auto internal-link suggestions", subtitle: "Auto-suggest links for any content", keywords: "auto link internal" },
  { href: "/tools/backlink-discovery", title: "Backlink discovery", subtitle: "Find new backlinks via free sources", keywords: "backlink discovery find" },
  { href: "/tools/anchor-distribution", title: "Anchor text distribution", subtitle: "Audit your backlink anchor profile", keywords: "anchor backlink distribution audit" },
  { href: "/tools/disavow", title: "Disavow file generator", subtitle: "Build Google disavow.txt", keywords: "disavow toxic backlinks" },
  { href: "/tools/outreach-personalize", title: "Outreach personalizer", subtitle: "AI personalizes link-building emails", keywords: "outreach personalize email link building" },
  { href: "/tools/reddit-research", title: "Reddit research", subtitle: "Mine Reddit for questions and pain points", keywords: "reddit research questions community" },
  { href: "/tools/content-grader", title: "Content grader", subtitle: "Score content for SEO + readability", keywords: "content grade score readability" },
  { href: "/tools/content-score", title: "Content scorer", subtitle: "Real-time SEO score with LSI suggestions", keywords: "content score lsi" },
  { href: "/tools/refresh", title: "Content refresh detector", subtitle: "Pages losing traffic, ranked by recovery value", keywords: "content refresh decay update" },
  { href: "/tools/plagiarism", title: "Plagiarism + AI detection", subtitle: "Originality + AI-likelihood scoring", keywords: "plagiarism ai detection originality" },
  { href: "/tools/summarizer", title: "Content summarizer", subtitle: "Summarize any URL or text", keywords: "summarize content text url" },
  { href: "/tools/news-headline", title: "News headline audit", subtitle: "Headline + lead audit for news SEO", keywords: "news headline editorial publisher" },
  { href: "/tools/social-preview", title: "Social preview (OG / Twitter)", subtitle: "Preview how a URL renders on Twitter / Facebook / LinkedIn", keywords: "og open graph twitter facebook social preview" },
  { href: "/tools/og-image", title: "OG image generator", subtitle: "Auto-generated Open Graph images per template", keywords: "og open graph image generator social" },
  { href: "/tools/image-gen", title: "AI image generation", subtitle: "DALL-E images for blog heroes (BYO OpenAI key)", keywords: "ai image generation dalle hero" },
  { href: "/tools/bulk-alt", title: "Bulk alt-text generator", subtitle: "AI alt text for many images", keywords: "alt text image accessibility bulk" },
  { href: "/tools/programmatic-seo", title: "Programmatic SEO generator", subtitle: "Generate hundreds of templated pages from CSV", keywords: "programmatic seo template csv" },
  { href: "/tools/hreflang", title: "Hreflang validator", subtitle: "Validate hreflang reciprocity + targeting", keywords: "hreflang international validator" },
  { href: "/tools/hreflang-gen", title: "Hreflang tag generator", subtitle: "Build hreflang tags from URL list", keywords: "hreflang generator tag international" },
  { href: "/tools/migration-map", title: "Migration redirect mapper", subtitle: "Old → new URL mapper for migrations", keywords: "migration redirect mapper 301" },
  { href: "/tools/migration-parity", title: "Migration parity audit", subtitle: "Diff before / after for site migrations", keywords: "migration parity diff before after" },
  { href: "/tools/redirects-bulk", title: "Bulk redirect tracer", subtitle: "Trace redirect chains across many URLs", keywords: "redirect bulk trace chain" },
  { href: "/tools/redirects-manager", title: "Redirect manager", subtitle: "CRUD UI for 301/302 rules + 404 log", keywords: "redirect manager 301 302 404" },
  { href: "/tools/robots", title: "Robots.txt + sitemap audit", subtitle: "Validate robots.txt + sitemap config", keywords: "robots sitemap validator" },
  { href: "/tools/robots-history", title: "Robots.txt history", subtitle: "Track changes to robots.txt over time", keywords: "robots history changes" },
  { href: "/tools/sitemap", title: "Sitemap generator", subtitle: "Crawl + generate XML / TXT / HTML sitemap", keywords: "sitemap generator xml" },
  { href: "/tools/llms-txt", title: "llms.txt manager", subtitle: "Generate + validate llms.txt for AI bots", keywords: "llms.txt ai bots manifest" },
  { href: "/tools/indexnow", title: "IndexNow submission", subtitle: "Push URLs to Bing / Yandex for instant indexing", keywords: "indexnow bing yandex indexing" },
  { href: "/tools/gsc-coverage", title: "GSC index coverage (batch)", subtitle: "Bulk check URL coverage in Google Search Console", keywords: "gsc coverage indexing batch google" },
  { href: "/tools/canonical-audit", title: "Canonical conflict detector", subtitle: "Find conflicting canonical / hreflang / sitemap signals", keywords: "canonical conflict audit" },
  { href: "/tools/headers", title: "HTTP headers + redirect chain", subtitle: "Inspect response headers + redirect chain", keywords: "http headers redirect chain" },
  { href: "/tools/security", title: "Security headers + SSL", subtitle: "Mozilla Observatory + SSL Labs in one view", keywords: "security ssl headers https" },
  { href: "/tools/mobile-friendly", title: "Mobile-friendly check", subtitle: "Google Mobile-Friendly Test", keywords: "mobile friendly test responsive" },
  { href: "/tools/crux", title: "CrUX field data", subtitle: "Real-world Core Web Vitals from Chrome User Experience report", keywords: "crux field core web vitals" },
  { href: "/tools/crux-origin", title: "CrUX origin", subtitle: "Origin-level CrUX data", keywords: "crux origin field data" },
  { href: "/tools/perf-budget", title: "Performance budget", subtitle: "Set + track performance budgets", keywords: "performance budget speed" },
  { href: "/tools/render", title: "Browser render check", subtitle: "Capture how Googlebot sees the rendered page", keywords: "render browser playwright headless" },
  { href: "/tools/wayback", title: "Wayback Machine snapshots", subtitle: "View historical snapshots of any URL", keywords: "wayback archive snapshots history" },
  { href: "/tools/screenshot-import", title: "Screenshot importer (OCR)", subtitle: "OCR + LLM parse data from screenshots", keywords: "screenshot ocr import" },
  { href: "/tools/youtube", title: "YouTube research", subtitle: "Mine YouTube for keywords + topics", keywords: "youtube research video" },
  { href: "/tools/youtube-audit", title: "YouTube SEO audit", subtitle: "Audit a YouTube channel's SEO", keywords: "youtube audit channel seo" },
  { href: "/tools/trending", title: "Trending topics", subtitle: "Multi-source trend detector", keywords: "trending topics trends" },
  { href: "/tools/branded-split", title: "Branded vs non-branded GSC split", subtitle: "Split GSC traffic between branded + non-branded", keywords: "branded non-branded gsc split" },
  { href: "/tools/traffic-drop", title: "Traffic drop analyzer", subtitle: "Diagnose sudden organic-traffic drops", keywords: "traffic drop diagnosis loss" },
  { href: "/tools/utm-attribution", title: "UTM / multi-touch attribution", subtitle: "Attribute conversions across channels", keywords: "utm attribution multi-touch" },
  { href: "/tools/uptime", title: "Uptime monitor", subtitle: "Track HTTP status + response time", keywords: "uptime monitor status" },
  { href: "/tools/soft-404", title: "Soft-404 catcher", subtitle: "Find pages returning 200 with no content", keywords: "soft 404 thin content" },
  { href: "/tools/facet-trap", title: "Faceted-nav trap detector", subtitle: "Find crawl-budget-eating faceted URLs", keywords: "faceted nav facet trap parameters" },
  { href: "/tools/dns-whois", title: "DNS + WHOIS lookup", subtitle: "DNS records + WHOIS info", keywords: "dns whois lookup" },
  { href: "/tools/domain-overview", title: "Domain overview", subtitle: "DA, traffic, backlinks at a glance", keywords: "domain overview da traffic" },
  { href: "/tools/link-checker", title: "Bulk link checker", subtitle: "Batch-check links for 4xx / 5xx", keywords: "link checker bulk broken" },
  { href: "/tools/bulk-scan", title: "Bulk URL scan", subtitle: "Full audit on many URLs in one go", keywords: "bulk url scan audit batch" },
  { href: "/tools/bing", title: "Bing webmaster insights", subtitle: "Bing-only queries + crawl issues", keywords: "bing webmaster insights" },
  { href: "/tools/github-pr", title: "GitHub PR — SEO fixes", subtitle: "Open a PR with auto SEO fixes", keywords: "github pr pull request fixes" },
  { href: "/tools/browser-agent", title: "Browser agent (experimental)", subtitle: "AI controls a real browser for a goal", keywords: "browser agent ai automation" },
  { href: "/tools/content-helpers", title: "Content helpers (categories / image prompts)", subtitle: "AI suggests categories + cover image prompts", keywords: "content helpers categories tags" },
];

export type SearchResults = {
  query: string;
  hits: SearchHit[];
};

export async function search(rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim();
  if (q.length < 1) return { query: q, hits: [] };
  const pattern = `%${q}%`;
  const qLc = q.toLowerCase();

  const hits: SearchHit[] = [];

  // Tools — first-class hit type so users can jump to any of the 90+
  // tools from the top search bar. In-memory match against title +
  // subtitle + keyword tags. Limited to 8 to keep the palette tidy.
  let toolIdx = 0;
  for (const t of TOOL_INDEX) {
    const hay = `${t.title} ${t.subtitle} ${t.keywords}`.toLowerCase();
    if (hay.includes(qLc)) {
      hits.push({
        type: "tool",
        id: toolIdx++,
        href: t.href,
        title: t.title,
        subtitle: t.subtitle,
      });
      if (toolIdx >= 8) break;
    }
  }

  // Clients — by name or url
  const clientMatches = await db
    .select({ id: clients.id, name: clients.name, url: clients.url })
    .from(clients)
    .where(or(like(clients.name, pattern), like(clients.url, pattern)))
    .limit(5);
  for (const c of clientMatches) {
    hits.push({
      type: "client",
      id: c.id,
      href: `/clients/${c.id}`,
      title: c.name,
      subtitle: c.url,
    });
  }

  // Tasks — by title
  const taskMatches = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      clientId: tasks.clientId,
      clientName: clients.name,
      priority: tasks.priority,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(like(tasks.title, pattern))
    .orderBy(desc(tasks.createdAt))
    .limit(6);
  for (const t of taskMatches) {
    hits.push({
      type: "task",
      id: t.id,
      href: "/tasks",
      title: t.title,
      subtitle: `${t.priority} · ${t.clientName ?? "—"}`,
    });
  }

  // Keywords — by query
  const keywordMatches = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientName: clients.name,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(like(keywords.query, pattern))
    .orderBy(desc(keywords.createdAt))
    .limit(5);
  for (const k of keywordMatches) {
    hits.push({
      type: "keyword",
      id: k.id,
      href: "/keywords",
      title: k.query,
      subtitle: `${k.country} · ${k.clientName ?? "—"}`,
    });
  }

  // Competitors — by name or url
  const competitorMatches = await db
    .select({
      id: competitors.id,
      name: competitors.name,
      url: competitors.url,
      clientName: clients.name,
    })
    .from(competitors)
    .leftJoin(clients, eq(competitors.clientId, clients.id))
    .where(or(like(competitors.name, pattern), like(competitors.url, pattern)))
    .limit(4);
  for (const c of competitorMatches) {
    hits.push({
      type: "competitor",
      id: c.id,
      href: "/competitors",
      title: c.name,
      subtitle: `competitor · ${c.clientName ?? "—"}`,
    });
  }

  // Outreach contacts
  const outreachMatches = await db
    .select({
      id: outreachContacts.id,
      name: outreachContacts.name,
      email: outreachContacts.email,
      status: outreachContacts.status,
      clientName: clients.name,
    })
    .from(outreachContacts)
    .leftJoin(clients, eq(outreachContacts.clientId, clients.id))
    .where(
      or(
        like(outreachContacts.name, pattern),
        like(outreachContacts.email, pattern),
        like(outreachContacts.website, pattern),
      ),
    )
    .limit(4);
  for (const o of outreachMatches) {
    hits.push({
      type: "outreach",
      id: o.id,
      href: "/outreach",
      title: o.name,
      subtitle: `${o.status} · ${o.clientName ?? "—"}${o.email ? " · " + o.email : ""}`,
    });
  }

  // Invoices — by number or client
  const invoiceMatches = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(like(invoices.invoiceNumber, pattern))
    .limit(4);
  for (const i of invoiceMatches) {
    hits.push({
      type: "invoice",
      id: i.id,
      href: `/invoices/${i.id}`,
      title: i.invoiceNumber,
      subtitle: `${i.status} · ${i.clientName ?? "—"}`,
    });
  }

  // Link-building resources — domain match (cap to 4)
  const resourceMatches = await db
    .select({
      id: seoResources.id,
      domain: seoResources.domain,
      category: seoResources.category,
      da: seoResources.da,
    })
    .from(seoResources)
    .where(like(seoResources.domain, pattern))
    .orderBy(desc(seoResources.da))
    .limit(4);
  for (const r of resourceMatches) {
    hits.push({
      type: "resource",
      id: r.id,
      href: `/link-building?q=${encodeURIComponent(r.domain)}`,
      title: r.domain,
      subtitle: `${r.category} · DA ${r.da ?? "—"}`,
    });
  }

  // Audits — exact id match (e.g. user types "12")
  if (/^\d+$/.test(q)) {
    const auditId = Number(q);
    const [a] = await db
      .select({
        id: audits.id,
        score: audits.score,
        clientName: clients.name,
      })
      .from(audits)
      .leftJoin(clients, eq(audits.clientId, clients.id))
      .where(eq(audits.id, auditId))
      .limit(1);
    if (a) {
      hits.push({
        type: "audit",
        id: a.id,
        href: `/audits/${a.id}`,
        title: `Audit #${a.id}`,
        subtitle: `${a.clientName ?? "—"} · score ${a.score ?? "—"}`,
      });
    }
  }

  return { query: q, hits };
}
