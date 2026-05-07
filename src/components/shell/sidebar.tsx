"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  ListChecks,
  ClipboardList,
  Search,
  FileText,
  Network,
  Sparkles,
  Settings,
  GraduationCap,
  Link2,
  Activity,
  Send,
  History,
  Workflow,
  Receipt,
  ScanText,
  PanelLeftClose,
  PanelLeftOpen,
  Wand2,
  Bot,
  FileDown,
  Gauge,
  GitCompare,
  MapPin,
  Wrench,
  Unlink,
  Building,
  Image as ImageIcon,
  Layers,
  Stethoscope,
  Save,
  Newspaper,
  TrendingDown,
  Flame,
  GitMerge,
  Magnet,
  type LucideIcon,
} from "lucide-react";

type Section = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const groups: { title: string; items: Section[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/morning", label: "Morning briefing", icon: Activity },
      { href: "/digest", label: "Weekly digest", icon: Send },
      { href: "/seo-chat", label: "SEO Chat", icon: Bot },
      { href: "/grader", label: "Instant audit", icon: Sparkles },
      { href: "/import", label: "Import screenshot", icon: ScanText },
      { href: "/capture", label: "Universal capture", icon: Magnet },
      { href: "/csv-import", label: "CSV import", icon: FileDown },
      { href: "/bot-logs", label: "AI bot logs", icon: Bot },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/capacity", label: "Capacity", icon: Gauge },
      { href: "/agent", label: "AI agent", icon: Bot },
      { href: "/ask", label: "Ask the tool", icon: Bot },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
    ],
  },
  {
    title: "Insight",
    items: [
      { href: "/audits", label: "Audits", icon: ClipboardList },
      { href: "/cwv", label: "Core Web Vitals", icon: Gauge },
      { href: "/landing-perf", label: "Landing-page perf", icon: Gauge },
      { href: "/keywords", label: "Keywords", icon: Search },
      { href: "/cannibalization", label: "Cannibalization", icon: GitMerge },
      { href: "/content", label: "Content", icon: FileText },
      { href: "/blog", label: "AI blog writer", icon: Wand2 },
      { href: "/title-tests", label: "Title A/B tests", icon: Wand2 },
      { href: "/backlinks", label: "Backlinks", icon: Link2 },
      { href: "/link-building", label: "Link building", icon: Link2 },
      { href: "/citations", label: "Citations / local", icon: MapPin },
      { href: "/local-rank", label: "Local rank", icon: MapPin },
      { href: "/gbp", label: "Google Business", icon: Building },
      { href: "/broken-links", label: "Broken links", icon: Unlink },
      { href: "/image-audit", label: "Image audit", icon: ImageIcon },
      { href: "/content-gap", label: "Content gap", icon: GitCompare },
      { href: "/topic-clusters", label: "Topic clusters", icon: Layers },
      { href: "/content-decay", label: "Content decay", icon: TrendingDown },
      { href: "/outreach", label: "Outreach", icon: Send },
      { href: "/outreach/templates", label: "Outreach templates", icon: Send },
      { href: "/link-building/prospects", label: "Link prospecting", icon: Link2 },
      { href: "/competitors", label: "Competitors", icon: Network },
      { href: "/competitors/playbook", label: "Competitor playbook", icon: Network },
      { href: "/brand-monitor", label: "Brand monitor", icon: Network },
      { href: "/local-grid", label: "Local heatmap", icon: MapPin },
      { href: "/compare", label: "Site compare", icon: GitCompare },
      { href: "/monitor", label: "Page monitor", icon: Activity },
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/ai-visibility", label: "AI visibility", icon: Sparkles },
      { href: "/activity", label: "Activity log", icon: History },
    ],
  },
  {
    title: "Quick tools",
    items: [
      { href: "/links", label: "Smart links", icon: Link2 },
      { href: "/tools/link-graph", label: "Link graph", icon: Network },
      { href: "/tools/link-recommender", label: "AI link recommender", icon: Sparkles },
      { href: "/tools/content-grader", label: "Content grader", icon: Gauge },
      { href: "/tools/refresh", label: "Refresh detector", icon: TrendingDown },
      { href: "/tools/eeat-audit", label: "E-E-A-T audit", icon: Stethoscope },
      { href: "/tools/content-helpers", label: "Image + tag helpers", icon: ImageIcon },
      { href: "/meta-rewrite", label: "Meta rewrite batch", icon: Wand2 },
      { href: "/tools/backlink-discovery", label: "Backlink discovery", icon: Link2 },
      { href: "/tools/search-volume", label: "Search volume", icon: Sparkles },
      { href: "/tools/health-check", label: "Health check", icon: Stethoscope },
      { href: "/tools/local-cwv", label: "Local CWV", icon: Gauge },
      { href: "/tools/render", label: "JS render + screenshot", icon: ImageIcon },
      { href: "/tools/browser-agent", label: "Browser agent", icon: Bot },
      { href: "/tools/log-analyzer", label: "Log analyzer", icon: Workflow },
      { href: "/tools/gsc-coverage", label: "GSC coverage", icon: ListChecks },
      { href: "/tools/redirects-bulk", label: "Bulk redirects", icon: Activity },
      { href: "/tools/migration-map", label: "Migration map", icon: GitMerge },
      { href: "/tools/schema-validate", label: "Schema validator", icon: Sparkles },
      { href: "/tools/social-preview", label: "OG / Twitter preview", icon: Sparkles },
      { href: "/tools/mobile-friendly", label: "Mobile-friendly", icon: Sparkles },
      { href: "/tools/anchor-distribution", label: "Anchor distribution", icon: Link2 },
      { href: "/tools/dns-whois", label: "DNS + WHOIS", icon: Sparkles },
      { href: "/tools/pagerank", label: "PageRank simulator", icon: Network },
      { href: "/tools/intent-classifier", label: "Intent classifier", icon: Sparkles },
      { href: "/tools/disavow", label: "Disavow generator", icon: Sparkles },
      { href: "/tools/brief", label: "Content brief composite", icon: FileText },
      { href: "/tools/cluster", label: "Topic cluster builder", icon: Layers },
      { href: "/tools/programmatic-seo", label: "Programmatic SEO", icon: Layers },
      { href: "/tools/og-image", label: "OG image generator", icon: ImageIcon },
      { href: "/tools/serp-features", label: "SERP feature tracker", icon: Sparkles },
      { href: "/tools/branded-split", label: "Branded GSC split", icon: GitMerge },
      { href: "/tools/robots-history", label: "robots.txt history", icon: History },
      { href: "/tools/uptime", label: "Uptime monitor", icon: Activity },
      { href: "/tools/migration-parity", label: "Migration parity", icon: GitMerge },
      { href: "/tools/hreflang-gen", label: "Hreflang generator", icon: Sparkles },
      { href: "/tools/wayback", label: "Wayback timeline", icon: History },
      { href: "/tools/summarizer", label: "AI summarizer", icon: Sparkles },
      { href: "/tools/bulk-alt", label: "Bulk alt-text", icon: ImageIcon },
      { href: "/tools/news-headline", label: "News headline audit", icon: Newspaper },
      { href: "/tools/auto-link", label: "Auto-link suggester", icon: Link2 },
      { href: "/tools/redirects-manager", label: "Redirect manager", icon: GitMerge },
      { href: "/tools/trending", label: "Trending ideas", icon: Flame },
      { href: "/tools/traffic-drop", label: "Traffic-drop diagnostic", icon: TrendingDown },
      { href: "/tools/ai-schema", label: "AI schema generator", icon: Sparkles },
      { href: "/tools/outreach-personalize", label: "Outreach personalizer", icon: Send },
      { href: "/tools/reddit-research", label: "Reddit research", icon: Flame },
      { href: "/news", label: "SEO news", icon: Newspaper },
      { href: "/tools", label: "All quick tools", icon: Wrench },
      { href: "/snapshots", label: "Saved snapshots", icon: Save },
      { href: "/algorithm-updates", label: "Algorithm updates", icon: History },
    ],
  },
  {
    title: "Deliverables",
    items: [
      { href: "/reports", label: "Reports", icon: FileDown },
      { href: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/learn", label: "Learn", icon: GraduationCap },
      { href: "/knowledge", label: "SEO knowledge hub", icon: GraduationCap },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/settings/ai-learning", label: "AI learning", icon: Sparkles },
      { href: "/settings/ai-usage", label: "AI usage + cost", icon: Activity },
    ],
  },
];

const STORAGE_KEY = "seo:sidebar-collapsed";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  unreadByHref,
}: {
  unreadByHref?: Record<string, number>;
} = {}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const unread = unreadByHref ?? {};

  // Hydrate from localStorage on mount — defer the setState to avoid cascading
  // renders flagged by react-hooks/set-state-in-effect.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (stored === "1") {
      const t = setTimeout(() => setCollapsed(true), 0);
      return () => clearTimeout(t);
    }
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  return (
    <aside
      className={`glass-apple hidden shrink-0 border-r border-white/[0.06] transition-[width] duration-200 ease-out md:flex md:flex-col ${
        collapsed ? "w-[72px]" : "w-72"
      }`}
    >
      {/* Brand */}
      <div
        className={`relative flex h-[68px] items-center gap-3 border-b border-white/[0.06] ${
          collapsed ? "justify-center px-2" : "px-5"
        }`}
      >
        <div className="pointer-events-none absolute -left-12 -top-10 size-40 rounded-full bg-violet-500/45 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-violet-500/40 to-transparent" />
        <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 text-base font-bold text-white shadow-lg shadow-violet-500/50 ring-1 ring-inset ring-white/30">
          <span className="relative">S</span>
          <span className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/35 to-transparent opacity-50" />
          <Sparkles className="absolute -right-1 -top-1 size-3 text-amber-300 drop-shadow-[0_0_5px_oklch(0.85_0.18_75)]" />
        </div>
        {!collapsed && (
          <div className="relative flex min-w-0 flex-1 flex-col leading-none">
            <span className="truncate text-base font-semibold tracking-tight text-foreground">
              SEO tool
            </span>
            <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              v0.1 · local
            </span>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Collapsed-mode expand button (sits at top of nav) */}
      {collapsed && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav
        className={`flex-1 overflow-y-auto py-5 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        {groups.map((group) => (
          <div key={group.title} className="mb-6">
            {!collapsed && (
              <div className="px-3 pb-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {group.title}
              </div>
            )}
            {collapsed && (
              <div
                aria-hidden
                className="mx-auto mb-2 h-px w-6 bg-white/[0.06]"
              />
            )}
            <ul className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      aria-label={collapsed ? label : undefined}
                      className={
                        collapsed
                          ? `group relative flex h-10 items-center justify-center rounded-lg transition-all ${
                              active
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                            }`
                          : active
                            ? "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-semibold text-foreground"
                            : "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground hover:translate-x-0.5"
                      }
                    >
                      {active && (
                        <>
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/25 via-fuchsia-500/12 to-transparent"
                          />
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-lg ring-1 ring-inset ring-violet-500/35"
                          />
                          {!collapsed && (
                            <span
                              aria-hidden
                              className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-violet-400 to-fuchsia-500 shadow-[0_0_12px_oklch(0.7_0.22_275_/_1)]"
                            />
                          )}
                        </>
                      )}
                      <Icon
                        className={`relative size-[19px] shrink-0 transition-colors ${
                          active
                            ? "text-violet-300"
                            : "text-muted-foreground/80 group-hover:text-foreground"
                        }`}
                      />
                      {!collapsed && (
                        <span className="relative flex-1">{label}</span>
                      )}
                      {unread[href] && unread[href] > 0 ? (
                        collapsed ? (
                          <span
                            aria-label={`${unread[href]} new`}
                            className="absolute right-1 top-1 size-2 rounded-full bg-rose-500 ring-2 ring-background"
                          />
                        ) : (
                          <span className="relative ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500/20 px-1.5 text-[10px] font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/40">
                            {unread[href] > 9 ? "9+" : unread[href]}
                          </span>
                        )
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Status line */}
      <div
        className={`border-t border-white/[0.06] py-3.5 ${
          collapsed ? "px-2" : "px-5"
        }`}
      >
        <div
          className={`flex items-center gap-2 text-[11px] text-muted-foreground/70 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          {!collapsed && <span>Local · everything stays on this machine</span>}
        </div>
      </div>
    </aside>
  );
}
