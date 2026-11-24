/**
 * Every tool, in one list: its address, its icon and the extra words
 * search should match it on.
 *
 * Before this file there were three hand-kept lists of the same tools:
 * the array inside tools-grid.tsx (no longer rendered, since /tools
 * forwards to Settings → Tools, but still parsed line by line by
 * scripts/gen-tool-capabilities.ts), the search index in
 * app/search/actions.ts (English titles only, eight retired tools still
 * offered, none of the ten pages below), and the icons in Settings →
 * Tools. They had drifted apart.
 *
 * Names and descriptions are NOT stored here. They come from the
 * translations (see lib/i18n/tool-copy.ts), so French and English stay
 * the single source and nothing here is shown to anyone. `keywords`
 * are search synonyms in both languages; they are matched, never shown.
 *
 * The sidebar and the catalogue in Settings → Tools (tool-catalog.ts)
 * stay curated. What must not happen is a tool being in no surface at
 * all; tool-registry.test.ts enforces that.
 *
 * Client-safe: plain data.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BadgeCheck,
  Bot,
  CalendarClock,
  Camera,
  Code2,
  Compass,
  CornerDownRight,
  Eye,
  FileText,
  Flame,
  Gauge,
  GitCompareArrows,
  GitMerge,
  Globe,
  Image as ImageIcon,
  Layers,
  Link2,
  Link as LinkIcon,
  ListChecks,
  Lock,
  Map as MapIcon,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Network,
  PanelRight,
  PenLine,
  RefreshCw,
  ScanText,
  SearchX,
  Send,
  ServerCog,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  StickyNote,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Video,
  Wand2,
  Zap,
} from "lucide-react";
import { isRetired } from "./tool-categories";

export type ToolEntry = {
  href: string;
  icon: LucideIcon;
  /** Search synonyms (FR and EN). Matched, never displayed. */
  keywords: string;
};

export const TOOLS: readonly ToolEntry[] = [
  { href: "/tools/health-check", icon: Stethoscope, keywords: "health check audit single page seo full" },
  { href: "/tools/trending", icon: Flame, keywords: "trending topics trends" },
  { href: "/tools/traffic-drop", icon: TrendingDown, keywords: "traffic drop diagnosis loss" },
  { href: "/tools/serp-volatility", icon: Activity, keywords: "serp volatility volatilité algorithm update mise à jour" },
  { href: "/tools/ads-funnel", icon: Megaphone, keywords: "ads google ads meta linkedin tiktok funnel publicité annonces" },
  { href: "/tools/cannibalization", icon: GitMerge, keywords: "cannibalization cannibalisation duplicate pages queries requêtes" },
  { href: "/tools/ai-schema", icon: Code2, keywords: "ai schema json-ld" },
  { href: "/tools/outreach-personalize", icon: Send, keywords: "outreach personalize email link building" },
  { href: "/tools/cluster", icon: Layers, keywords: "cluster keyword topic group" },
  { href: "/tools/programmatic-seo", icon: Layers, keywords: "programmatic seo template csv" },
  { href: "/tools/og-image", icon: ImageIcon, keywords: "og open graph image generator social" },
  { href: "/tools/serp-features", icon: Sparkles, keywords: "serp features ai overview snippet local pack paa" },
  { href: "/tools/branded-split", icon: GitMerge, keywords: "branded non-branded gsc split" },
  { href: "/tools/robots-history", icon: Activity, keywords: "robots history changes" },
  { href: "/tools/uptime", icon: Activity, keywords: "uptime monitor status" },
  { href: "/tools/migration-parity", icon: GitMerge, keywords: "migration parity diff before after" },
  { href: "/tools/hreflang-gen", icon: Globe, keywords: "hreflang generator tag international" },
  { href: "/tools/wayback", icon: Activity, keywords: "wayback archive snapshots history" },
  { href: "/tools/summarizer", icon: FileText, keywords: "summarize content text url" },
  { href: "/tools/bulk-alt", icon: ImageIcon, keywords: "alt text image accessibility bulk" },
  { href: "/tools/auto-link", icon: Link2, keywords: "auto link internal" },
  { href: "/tools/youtube-audit", icon: Video, keywords: "youtube audit channel seo" },
  { href: "/tools/soft-404", icon: ScanText, keywords: "soft 404 thin content" },
  { href: "/tools/canonical-audit", icon: GitMerge, keywords: "canonical conflict audit" },
  { href: "/tools/redirects-manager", icon: CornerDownRight, keywords: "redirect manager 301 302 404" },
  { href: "/tools/gsc-coverage", icon: ListChecks, keywords: "gsc coverage indexing batch google" },
  { href: "/tools/redirects-bulk", icon: CornerDownRight, keywords: "redirect bulk trace chain" },
  { href: "/tools/migration-map", icon: GitMerge, keywords: "migration redirect mapper 301" },
  { href: "/tools/schema-validate", icon: ShieldCheck, keywords: "schema validator json-ld structured" },
  { href: "/tools/social-preview", icon: Share2, keywords: "og open graph twitter facebook social preview" },
  { href: "/tools/mobile-friendly", icon: Smartphone, keywords: "mobile friendly test responsive" },
  { href: "/tools/anchor-distribution", icon: Link2, keywords: "anchor backlink distribution audit" },
  { href: "/tools/dns-whois", icon: Globe, keywords: "dns whois lookup" },
  { href: "/tools/pagerank", icon: Network, keywords: "pagerank internal authority" },
  { href: "/tools/intent-classifier", icon: Compass, keywords: "intent classifier serp commercial transactional informational" },
  { href: "/tools/disavow", icon: ShieldCheck, keywords: "disavow toxic backlinks" },
  { href: "/tools/render", icon: Camera, keywords: "render browser playwright headless" },
  { href: "/tools/gbp-reply", icon: MessageCircle, keywords: "google business profile gbp review avis reply réponse" },
  { href: "/tools/local-cwv", icon: Gauge, keywords: "core web vitals lcp cls inp performance speed" },
  { href: "/tools/eeat-audit", icon: ShieldCheck, keywords: "eeat trust authority experience expertise" },
  { href: "/tools/refresh", icon: RefreshCw, keywords: "content refresh decay update" },
  { href: "/tools/link-recommender", icon: Sparkles, keywords: "internal link ai recommender" },
  { href: "/meta-rewrite", icon: Wand2, keywords: "meta title description bulk rewrite réécriture titres" },
  { href: "/tools/content-helpers", icon: ImageIcon, keywords: "content helpers categories tags" },
  { href: "/knowledge", icon: Compass, keywords: "knowledge resources ressources learn apprendre" },
  { href: "/tools/bulk-scan", icon: ListChecks, keywords: "bulk url scan audit batch" },
  { href: "/tools/content-score", icon: Gauge, keywords: "content score lsi" },
  { href: "/tools/headers", icon: ServerCog, keywords: "http headers redirect chain" },
  { href: "/tools/pixel-preview", icon: Eye, keywords: "serp simulator preview title meta pixel" },
  { href: "/tools/hreflang", icon: Eye, keywords: "hreflang international validator" },
  { href: "/tools/ai-overview", icon: Eye, keywords: "ai overview aio google sge generative experience" },
  { href: "/content", icon: PenLine, keywords: "content studio contenu article brief rédaction" },
  { href: "/tools/schema", icon: Code2, keywords: "schema json-ld structured data" },
  { href: "/tools/robots", icon: FileText, keywords: "robots sitemap validator" },
  { href: "/tools/security", icon: ShieldCheck, keywords: "security ssl headers https" },
  { href: "/tools/llms-txt", icon: Sparkles, keywords: "llms.txt ai bots manifest" },
  { href: "/tools/domain-overview", icon: Globe, keywords: "domain overview da traffic" },
  { href: "/tools/link-checker", icon: LinkIcon, keywords: "link checker bulk broken" },
  { href: "/tools/keyword-difficulty", icon: Gauge, keywords: "keyword difficulty kd da" },
  { href: "/tools/external", icon: Globe, keywords: "external tools outils externes moz ahrefs ssl labs" },
  { href: "/tools/internal-linking", icon: Link2, keywords: "internal links linking opportunities" },
  { href: "/tools/link-graph", icon: Network, keywords: "link graph visualization internal" },
  { href: "/tools/sitemap", icon: MapIcon, keywords: "sitemap generator xml" },
  { href: "/tools/indexnow", icon: Zap, keywords: "indexnow bing yandex indexing" },
  { href: "/tools/bing", icon: Globe, keywords: "bing webmaster insights" },
  { href: "/tools/crux", icon: Activity, keywords: "crux field core web vitals" },
  { href: "/tools/youtube", icon: Video, keywords: "youtube research video" },
  { href: "/tools/content-grader", icon: Gauge, keywords: "content grade score readability" },
  { href: "/tools/backlink-discovery", icon: LinkIcon, keywords: "backlink discovery find" },
  { href: "/tools/link-intersect", icon: GitCompareArrows, keywords: "link intersect backlinks competitors concurrents" },
  { href: "/tools/search-volume", icon: Gauge, keywords: "search volume bulk estimator keyword" },
  { href: "/tools/meta-tag-generator", icon: Code2, keywords: "meta title description og open graph seo" },
  { href: "/tools/code-generator", icon: Code2, keywords: "wordpress plugin htaccess shopify liquid schema nextjs code ai" },
  { href: "/tools/reddit-research", icon: Flame, keywords: "reddit research questions community" },
  { href: "/algorithm-updates", icon: Lock, keywords: "google algorithm update mise à jour core update" },
  { href: "/tools/person-schema", icon: ShieldCheck, keywords: "person schema author bio" },
  { href: "/tools/aio-passage", icon: Sparkles, keywords: "aio passage ai overview citation" },
  { href: "/tools/ai-robots", icon: Bot, keywords: "ai robots gptbot claudebot perplexitybot robots.txt crawlers" },
  { href: "/tools/freshness", icon: CalendarClock, keywords: "freshness fraîcheur date updated mise à jour content" },
  { href: "/tools/reputation-abuse-risk", icon: ShieldCheck, keywords: "reputation abuse policy google" },
  { href: "/tools/ai-citation-tactics", icon: Sparkles, keywords: "llm citation chatgpt claude perplexity" },
  { href: "/tools/crux-origin", icon: Gauge, keywords: "crux origin field data" },
  { href: "/tools/perf-budget", icon: Gauge, keywords: "performance budget speed" },
  { href: "/tools/facet-trap", icon: Network, keywords: "faceted nav facet trap parameters" },
  { href: "/tools/screenshot-import", icon: ScanText, keywords: "screenshot ocr import" },
  { href: "/tools/github-pr", icon: GitMerge, keywords: "github pr pull request fixes" },
  { href: "/tools/geo-swot", icon: Sparkles, keywords: "geo swot ai visibility visibilité ia" },
  { href: "/tools/geo-score", icon: Sparkles, keywords: "geo aeo generative engine optimization ai" },
  { href: "/tools/sxo", icon: Eye, keywords: "sxo search experience ux intent" },
  { href: "/tools/image-gen", icon: ImageIcon, keywords: "ai image generation dalle hero" },
  { href: "/tools/utm-attribution", icon: Network, keywords: "utm attribution multi-touch" },
  { href: "/tools/rank-where", icon: Compass, keywords: "rank tracker position serp google country" },
  { href: "/tools/wp-hack-scan", icon: ShieldCheck, keywords: "wordpress malware hack security backdoor cloudflare" },

  // Pages that were built and translated but missing from the old tool
  // grid and from search. Each is also in Settings → Tools, on its own
  // card or as a tab of a family (tool-families.ts).
  { href: "/ask", icon: MessageSquareText, keywords: "ask question chat assistant why traffic dropped help demander question assistant pourquoi trafic" },
  { href: "/content-gap", icon: SearchX, keywords: "content gap queries impressions ctr refresh opportunity requêtes clics contenu à retravailler" },
  { href: "/bot-logs", icon: Bot, keywords: "log file access log nginx apache gptbot claudebot crawl budget server journal serveur robots" },
  { href: "/image-audit", icon: ImageIcon, keywords: "image alt text webp avif lazy loading size dimensions images texte alternatif poids" },
  { href: "/brand-serp", icon: BadgeCheck, keywords: "brand serp reputation own the serp first page control marque première page" },
  { href: "/knowledge-panel", icon: PanelRight, keywords: "knowledge panel entity brand graph wikipedia crunchbase fiche entité marque" },
  { href: "/author-authority", icon: UserCheck, keywords: "author eeat authority bio credentials sameas expertise auteurs autorité" },
  { href: "/landing-perf", icon: TrendingUp, keywords: "conversion ga4 clicks landing page roi revenue pages d'atterrissage clics" },
  { href: "/links", icon: LinkIcon, keywords: "short link utm tracking redirect click outreach lien court suivi clics" },
  { href: "/annotations", icon: StickyNote, keywords: "annotation timeline marker algorithm update launch migration repère graphique" },
];

const BY_HREF = new Map(TOOLS.map((t) => [t.href, t]));

/** Lookup by exact route (query and hash ignored). */
export function toolByHref(href: string): ToolEntry | null {
  return BY_HREF.get(href.split(/[?#]/)[0]) ?? null;
}

/** The tool's icon, if it is in the registry. */
export function toolIcon(href: string): LucideIcon | null {
  return toolByHref(href)?.icon ?? null;
}

/**
 * What global search offers: every tool except the retired ones.
 *
 * Retired tools still work (they are tabs of the tool that replaced
 * them), but search used to offer them by name next to their
 * replacement, steering people to the superseded page.
 */
export function searchableTools(): ToolEntry[] {
  return TOOLS.filter((t) => !isRetired(t.href));
}
