export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Activity,
  Code2,
  Eye,
  FileText,
  Flame,
  Gauge,
  Globe,
  Link as LinkIcon,
  Link2,
  ListChecks,
  Lock,
  Map,
  Network,
  ScanText,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

const tools = [
  {
    href: "/tools/health-check",
    icon: Stethoscope,
    title: "Full SEO health check ⭐",
    description:
      "One URL → audit + robots + hreflang + security + Core Web Vitals + image audit + redirect chain in parallel. Save snapshots to compare before / after.",
    accent: "violet",
  },
  {
    href: "/tools/bulk-scan",
    icon: ListChecks,
    title: "Bulk URL scanner",
    description:
      "Paste up to 25 URLs. Run the full health check on each in parallel + save every result as a snapshot. Sortable table.",
    accent: "violet",
  },
  {
    href: "/tools/content-score",
    icon: Gauge,
    title: "Content scorer",
    description:
      "Paste content + target keyword. AI scores readability, density, structure, suggests LSI terms + specific edits.",
    accent: "emerald",
  },
  {
    href: "/tools/headers",
    icon: ServerCog,
    title: "HTTP headers + redirect chain",
    description:
      "Trace every redirect step + show full HTTP response headers at each hop. Critical for debugging canonicalization, redirects, and CDN config.",
    accent: "amber",
  },
  {
    href: "/tools/pixel-preview",
    icon: Eye,
    title: "Pixel preview",
    description:
      "See exactly how your title + meta description will look in Google's SERP. Click pre-cut, character counts, mobile + desktop.",
    accent: "violet",
  },
  {
    href: "/tools/hreflang",
    icon: Eye,
    title: "Hreflang validator",
    description:
      "Checks all hreflang tags (HTML + HTTP), validates format, x-default, self-reference, and reciprocal links across language variants.",
    accent: "cyan",
  },
  {
    href: "/tools/ai-overview",
    icon: Eye,
    title: "AI Overview optimizer",
    description:
      "AI scores your page's citation-worthiness for Google's AI Overviews. Specific changes to make ranked by impact.",
    accent: "rose",
  },
  {
    href: "/tools/schema",
    icon: Code2,
    title: "Schema markup generator",
    description:
      "AI generates valid JSON-LD for Article, LocalBusiness, FAQ, Product, Recipe, Event. Paste your URL — we extract the rest.",
    accent: "cyan",
  },
  {
    href: "/tools/robots",
    icon: FileText,
    title: "Robots.txt + sitemap validator",
    description:
      "Fetch + check robots.txt, sitemap.xml. Find blocked URLs, broken sitemap entries, indexability issues.",
    accent: "emerald",
  },
  {
    href: "/tools/security",
    icon: ShieldCheck,
    title: "Security headers + SSL grade",
    description:
      "Mozilla Observatory + SSL Labs. Free, no key. Surface fix-it actions for security ranking signals.",
    accent: "amber",
  },
  {
    href: "/tools/llms-txt",
    icon: Sparkles,
    title: "llms.txt manager",
    description:
      "Generate + validate llms.txt — the emerging standard for telling AI crawlers what your site is about.",
    accent: "rose",
  },
  {
    href: "/tools/domain-overview",
    icon: Globe,
    title: "Domain overview",
    description:
      "Every signal we can check ourselves — HTTPS, security headers, schema, on-page basics, indexed-pages estimate. Plus links to free external checkers for DA/DR.",
    accent: "violet",
  },
  {
    href: "/tools/link-checker",
    icon: LinkIcon,
    title: "Link analyzer",
    description:
      "Paste any URL → every <a> link classified internal/external + dofollow/nofollow, with anchor text frequency. Critical pre-publish check.",
    accent: "cyan",
  },
  {
    href: "/tools/keyword-difficulty",
    icon: Gauge,
    title: "Keyword difficulty",
    description:
      "Heuristic 0-100 score from real SERP signals — big-brand presence, SERP features, title competitiveness. AI summary if your AI key is configured.",
    accent: "amber",
  },
  {
    href: "/tools/external",
    icon: Globe,
    title: "External tools launchpad",
    description:
      "Paste a URL or keyword once → all 28 external tools (Moz DA, Ahrefs, SSL Labs, Wayback, etc.) open with that context pre-filled.",
    accent: "cyan",
  },
  {
    href: "/tools/internal-linking",
    icon: Link2,
    title: "Internal linking suggester",
    description:
      "Crawl your site, find pages that mention your target keyword without linking to your target URL. The fastest way to compound on-site authority.",
    accent: "violet",
  },
  {
    href: "/tools/link-graph",
    icon: Network,
    title: "Internal-link analyser",
    description:
      "Crawl + build link graph. Surfaces orphan pages and proposes top-3 source pages for each via TF-IDF cosine similarity. CSV / JSON export.",
    accent: "violet",
  },
  {
    href: "/tools/sitemap",
    icon: Map,
    title: "Sitemap generator",
    description:
      "Crawl any site, generate sitemap.xml + plain-text URL list + human-readable HTML index. Respects robots.txt by default.",
    accent: "cyan",
  },
  {
    href: "/tools/indexnow",
    icon: Zap,
    title: "IndexNow submitter",
    description:
      "Push fresh URLs to Bing, Yandex, Naver, Seznam in seconds. Free, no API key — one verification file per host.",
    accent: "cyan",
  },
  {
    href: "/tools/bing",
    icon: Globe,
    title: "Bing Webmaster Tools",
    description:
      "Free Bing organic data — top queries, top pages, crawl issues, URL submission. Add a free Bing API key once.",
    accent: "cyan",
  },
  {
    href: "/tools/crux",
    icon: Activity,
    title: "Real-user CWV (CrUX)",
    description:
      "Real Chrome user data over the last 28 days. Same data Google uses for page-experience ranking. Free with a PageSpeed key.",
    accent: "emerald",
  },
  {
    href: "/tools/youtube",
    icon: Video,
    title: "YouTube keyword research",
    description:
      "Real video data — view counts, channels, recurring tag phrases. Free YouTube Data API tier (100 searches a day).",
    accent: "rose",
  },
  {
    href: "/tools/content-grader",
    icon: Gauge,
    title: "Content grader (Surfer / Clearscope replacement)",
    description:
      "Pulls top 10 SERP results, builds a TF-IDF corpus, scores your draft on length / term coverage / density. Free, browser-mode.",
    accent: "emerald",
  },
  {
    href: "/tools/backlink-discovery",
    icon: LinkIcon,
    title: "Backlink discovery",
    description:
      "DuckDuckGo + Common Crawl + crawl-to-confirm. Finds real verified backlinks with anchor text + rel. Closes the Ahrefs gap as much as is possible without a paid index.",
    accent: "violet",
  },
  {
    href: "/tools/search-volume",
    icon: Gauge,
    title: "Search-volume estimator",
    description:
      "Free directional volume bucket. Combines Google Trends, Google + Bing autocomplete, SERP characteristics. No paid keyword DB.",
    accent: "cyan",
  },
  {
    href: "/tools/plagiarism",
    icon: ScanText,
    title: "Plagiarism + AI detector",
    description:
      "AI-likelihood + originality scores on any draft. Flags AI-template phrases. Links to Copyleaks, GPTZero, Originality.ai for definitive web check.",
    accent: "rose",
  },
  {
    href: "/tools/reddit-research",
    icon: Flame,
    title: "Reddit research",
    description:
      "Reddit is in 40% of LLM citations. Mine real questions and pain points your audience asks — perfect FAQ + content brief seeds.",
    accent: "rose",
  },
  {
    href: "/algorithm-updates",
    icon: Lock,
    title: "Algorithm updates",
    description:
      "Timeline of every Google algorithm update with confirmed dates. Correlate against your traffic drops.",
    accent: "violet",
  },
];

const accentMap: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

export default function ToolsHubPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Quick tools"
        description="Single-URL utilities that don't require a client. Free, instant, no signup. Use them on any site, including yours during pitches."
        icon={Wrench}
        accent="violet"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="glass-apple lift-on-hover group relative overflow-hidden rounded-2xl p-5"
          >
            <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative space-y-3">
              <div
                className={`inline-flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ${accentMap[t.accent]}`}
              >
                <t.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold">{t.title}</h3>
              <p className="text-sm text-muted-foreground">{t.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
