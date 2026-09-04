import Link from "next/link";
import { ToolDot } from "@/components/tool-dot";
import { NEEDS_HINTS, toolReadiness } from "@/lib/tool-readiness";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Bot,
  ClipboardCheck,
  Code2,
  Compass,
  Eye,
  FileText,
  Flame,
  Gauge,
  Globe,
  Link as LinkIcon,
  Network,
  RefreshCw,
  ScanLine,
  Search as SearchIcon,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
} from "lucide-react";

/**
 * Per-client tool launcher — replaces the "click around the sidebar to find
 * the right tool" pattern with a single panel on the client page that lists
 * every tool that benefits from the client's context, pre-filled with the
 * client's URL / id / GSC connection where possible.
 *
 * Groups are intentionally tight (3-6 tools each) so users see ~25 cards
 * total rather than the full 100-tool index.
 */

export type ClientToolLink = {
  href: string;
  title: string;
  icon: typeof Activity;
  blurb: string;
  /** Optional — shown as a chip when the tool needs setup. */
  needs?: "gsc" | "gbp" | "ga4" | "wp-bridge" | null;
};

export type ClientToolGroup = {
  label: string;
  blurb: string;
  tools: ClientToolLink[];
};

export type ClientToolsClient = {
  id: number;
  url: string;
  gscProperty: string | null;
  gbpUrl: string | null;
  ga4PropertyId: string | null;
  wpEndpoint: string | null;
};

export function buildClientToolGroups(
  client: ClientToolsClient,
): ClientToolGroup[] {
  return buildGroups(client);
}

function buildGroups(client: {
  id: number;
  url: string;
  gscProperty: string | null;
  gbpUrl: string | null;
  ga4PropertyId: string | null;
  wpEndpoint: string | null;
}): ClientToolGroup[] {
  // Tools encoded with deep links that pre-fill the client's URL where the
  // target tool supports it via the `url` query param. The tool pages that
  // already handle ?url= or ?clientId= work without further changes.
  const u = encodeURIComponent(client.url);
  const id = client.id;
  return [
    {
      label: "Run an audit",
      blurb: "Full SEO audits + scoring for this client.",
      tools: [
        {
          href: `/audits?clientId=${id}`,
          title: "Run a full audit",
          icon: ClipboardCheck,
          blurb: "Crawl + 30 SEO checks. Compare to last audit.",
        },
        {
          href: `/tools/health-check?url=${u}`,
          title: "Single-page health check",
          icon: Activity,
          blurb: "Full-page health: meta, schema, CWV, security headers.",
        },
        {
          href: `/tools/eeat-audit?url=${u}`,
          title: "E-E-A-T audit",
          icon: ShieldCheck,
          blurb: "Experience / Expertise / Authority / Trust.",
        },
        {
          href: `/tools/geo-score?url=${u}`,
          title: "GEO composite score",
          icon: Sparkles,
          blurb: "AI search visibility scorecard.",
        },
        {
          href: `/tools/sxo?url=${u}`,
          title: "SXO audit",
          icon: Eye,
          blurb: "Search experience + intent satisfaction.",
        },
        {
          href: `/clients/${id}/ai-audit`,
          title: "AI site audit",
          icon: Bot,
          blurb: "AI checklist with apply-via-WP-bridge fixes.",
        },
      ],
    },
    {
      label: "Rank tracking + research",
      blurb: "Keywords, rank checks, SERP analysis for this client.",
      tools: [
        {
          href: `/keywords?clientId=${id}`,
          title: "Tracked keywords",
          icon: Target,
          blurb: "Sortable rank table with mobile/desktop split.",
        },
        {
          href: `/tools/rank-where?domain=${u}`,
          title: "Where do I rank?",
          icon: Compass,
          blurb: "Country-aware rank + AIO citation for any query.",
        },
        {
          href: `/tools/serp-features`,
          title: "SERP feature tracker",
          icon: ScanLine,
          blurb: "AI Overview / Featured Snippet / Local Pack presence.",
        },
        {
          href: `/tools/content-attack-brief?clientId=${id}`,
          title: "Content attack brief",
          icon: Target,
          blurb: "Striking-distance queries × Impact × Confidence.",
          needs: client.gscProperty ? null : "gsc",
        },
        {
          href: `/tools/traffic-drop?clientId=${id}`,
          title: "Traffic-drop analyzer",
          icon: TrendingDown,
          blurb: "Diagnose sudden organic-traffic losses.",
          needs: client.gscProperty ? null : "gsc",
        },
        {
          href: `/tools/branded-split?clientId=${id}`,
          title: "Branded vs non-branded",
          icon: Network,
          blurb: "Split GSC traffic to see real organic growth.",
          needs: client.gscProperty ? null : "gsc",
        },
        {
          href: `/tools/serp-volatility`,
          title: "SERP volatility tracker",
          icon: Activity,
          blurb:
            "Day-over-day position shifts across tracked keywords — spot algorithm updates.",
        },
        {
          href: `/tools/cannibalization`,
          title: "Keyword cannibalization",
          icon: AlertTriangle,
          blurb: "Find queries where multiple pages compete and hurt each other.",
          needs: client.gscProperty ? null : "gsc",
        },
      ],
    },
    {
      label: "Paid ads & growth",
      blurb: "Multi-platform paid-ads strategy + copy generator.",
      tools: [
        {
          href: `/tools/ads-funnel?clientId=${id}`,
          title: "Ad Funnel Architect ⭐",
          icon: Sparkles,
          blurb:
            "Meta / Google / LinkedIn / TikTok / YouTube — copy, image prompts, keywords, funnel + budget split.",
        },
      ],
    },
    {
      label: "Content for this client",
      blurb: "Briefs, refresh, writing, AI / human checks.",
      tools: [
        {
          href: `/content/c/${id}`,
          title: "Content calendar",
          icon: FileText,
          blurb: "Plan + draft posts for this client.",
        },
        {
          href: `/content-decay/c/${id}`,
          title: "Refresh candidates",
          icon: RefreshCw,
          blurb: "Pages losing traffic, prioritized by recovery value.",
        },
        {
          href: `/topic-clusters/c/${id}`,
          title: "Topic clusters",
          icon: Network,
          blurb: "Map pillar + supporting pages by topic.",
        },
        {
          href: `/tools/brief`,
          title: "Composite content brief",
          icon: BookOpen,
          blurb: "Length + headings + semantic + PAA in one brief.",
        },
        {
          href: `/tools/expert-panel`,
          title: "Expert-panel scorer",
          icon: Bot,
          blurb: "Score a draft against a domain expert panel.",
        },
        {
          href: `/tools/ai-slop`,
          title: "AI slop detector",
          icon: AlertTriangle,
          blurb: "24-pattern humanizer check.",
        },
      ],
    },
    {
      label: "Links — internal + outbound",
      blurb: "Internal linking, prospects, anchor profile.",
      tools: [
        {
          href: `/tools/internal-linking?domain=${u}`,
          title: "Internal linking opportunities",
          icon: LinkIcon,
          blurb: "Existing pages that should link to a target URL.",
        },
        {
          href: `/tools/link-graph?domain=${u}`,
          title: "Internal link graph",
          icon: Network,
          blurb: "Visualize the site's link structure.",
        },
        {
          href: `/tools/pagerank?domain=${u}`,
          title: "Internal PageRank",
          icon: Sparkles,
          blurb: "Distribute authority across this site's pages.",
        },
        {
          href: `/backlinks?clientId=${id}`,
          title: "Backlink hub",
          icon: LinkIcon,
          blurb: "Tracked backlinks for this client.",
        },
        {
          href: `/link-building/library`,
          title: "Prospects library (314 sites)",
          icon: Globe,
          blurb: "Curated backlink prospects, 35+ countries.",
        },
        {
          href: `/tools/anchor-distribution`,
          title: "Anchor distribution",
          icon: Network,
          blurb: "Audit the anchor text of the client's backlinks.",
        },
      ],
    },
    {
      label: "Local SEO + GBP",
      blurb: "Google Business Profile, citations, local ranks.",
      tools: [
        {
          href: `/gbp/c/${id}`,
          title: "Google Business Profile",
          icon: Globe,
          blurb: "Reviews, posts, hours, AI reply drafts.",
          needs: client.gbpUrl ? null : "gbp",
        },
        {
          href: `/citations`,
          title: "Citations tracker",
          icon: SearchIcon,
          blurb: "NAP consistency across local directories.",
        },
        {
          href: `/local-grid`,
          title: "Local rank grid",
          icon: Compass,
          blurb: "Geo-grid rank tracking (city-level).",
        },
        {
          href: `/local-rank`,
          title: "Local rank tracker",
          icon: Target,
          blurb: "Track local-pack positions for this client.",
        },
      ],
    },
    {
      label: "Technical + speed",
      blurb: "CWV, security, malware, render checks.",
      tools: [
        {
          href: `/tools/local-cwv?url=${u}`,
          title: "Core Web Vitals",
          icon: Gauge,
          blurb: "LCP / CLS / INP measurement on this client.",
        },
        {
          href: `/tools/security?url=${u}`,
          title: "Security headers + SSL",
          icon: ShieldCheck,
          blurb: "Mozilla Observatory + SSL Labs.",
        },
        {
          href: `/tools/wp-hack-scan?url=${u}`,
          title: "WordPress hack scan",
          icon: AlertTriangle,
          blurb: "Backdoor / malware / cloaking probe.",
        },
        {
          href: `/tools/render?url=${u}`,
          title: "Render check",
          icon: Eye,
          blurb: "See how Googlebot renders the page.",
        },
      ],
    },
    {
      label: "Generators",
      blurb: "Code, meta tags, schema, social previews.",
      tools: [
        {
          href: `/tools/code-generator`,
          title: "Code / plugin generator",
          icon: Code2,
          blurb: "WP plugins, .htaccess, Elementor HTML, schema.",
        },
        {
          href: `/tools/meta-tag-generator`,
          title: "Meta tag generator",
          icon: FileText,
          blurb: "Title + description options with SERP preview.",
        },
        {
          href: `/tools/schema?url=${u}`,
          title: "Schema generator",
          icon: Code2,
          blurb: "JSON-LD for any schema.org type.",
        },
        {
          href: `/tools/og-image`,
          title: "OG image generator",
          icon: Sparkles,
          blurb: "Auto-generated Open Graph images.",
        },
      ],
    },
    {
      label: "Reports + automation",
      blurb: "Client portal, scheduled reports, workflows.",
      tools: [
        {
          href: `/reports?clientId=${id}`,
          title: "Generate report",
          icon: FileText,
          blurb: "AI exec summary + PDF + client portal magic link.",
        },
        {
          href: `/clients/${id}/onboarding`,
          title: "Onboarding wizard",
          icon: ClipboardCheck,
          blurb: "Brand + keywords + targeting setup.",
        },
        {
          href: `/automations`,
          title: "Automations",
          icon: Bot,
          blurb: "Trigger Slack / task / webhook on events.",
        },
        {
          href: `/digest`,
          title: "Weekly digest",
          icon: Flame,
          blurb: "Auto-mailed weekly summary.",
        },
      ],
    },
  ];
}

/**
 * Re-exported so existing importers keep working. The table itself lives
 * in lib/tool-readiness.ts — it was written here and again in the
 * readiness rule, and two copies of a hint string is exactly the drift
 * CLAUDE.md's fourth standing rule is about.
 */
export { NEEDS_HINTS as CLIENT_TOOL_NEEDS_HINTS } from "@/lib/tool-readiness";

export function ClientToolsLauncher({
  client,
  hasAiKey = false,
}: {
  client: {
    id: number;
    url: string;
    gscProperty: string | null;
    gbpUrl: string | null;
    ga4PropertyId: string | null;
    wpEndpoint: string | null;
  };
  /** Whether an AI key exists, so the dots can tell ready from blocked. */
  hasAiKey?: boolean;
}) {
  const groups = buildGroups(client);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Tools for this client
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every tool below is pre-wired with this client&apos;s URL or
              connected accounts. Tip: ⌘K opens search and jumps to any tool.
            </p>
          </div>
        </div>
      </header>
      <div className="space-y-6 p-5">
        {groups.map((g) => (
          <div key={g.label} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">{g.label}</h3>
              <p className="text-[11px] text-muted-foreground">{g.blurb}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.tools.map((t) => {
                const Icon = t.icon;
                const r = toolReadiness({
                  href: t.href,
                  needs: t.needs,
                  hasAiKey,
                });
                const blocked = r.state === "blocked" ? r : null;
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className="group relative overflow-hidden rounded-md bg-white/[0.02] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.05]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="grid size-7 shrink-0 place-items-center rounded-md bg-violet-500/10 ring-1 ring-inset ring-violet-500/30">
                        <Icon className="size-3.5 text-violet-300" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {/* Same dot, same rule, as the main sidebar
                            and the per-client rail — one function in
                            lib/tool-readiness.ts decides all three.
                            This panel used to paint green wherever the
                            sidebar stayed silent, so the same tool got
                            two different answers depending on which
                            panel you were looking at. */}
                        <p className="flex items-start gap-1.5 truncate text-xs font-medium group-hover:text-violet-200">
                          <ToolDot
                            href={t.href}
                            needs={t.needs}
                            hasAiKey={hasAiKey}
                            className="mt-[0.25rem]"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {t.title}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.blurb}
                        </p>
                        {/* A span, not a link: the whole card is
                            already a <Link>, and nesting one inside
                            another is invalid HTML. */}
                        {blocked && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
                            {blocked.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
