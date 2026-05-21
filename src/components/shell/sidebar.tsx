"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, LayoutGroup } from "motion/react";
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
  Building,
  Image as ImageIcon,
  Layers,
  Newspaper,
  TrendingDown,
  Flame,
  GitMerge,
  Magnet,
  Megaphone,
  Target,
  Video,
  Globe,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Items marked `guided: true` are visible in Guided mode (the default
   * for new users). Items without the flag are Pro-only — they still
   * exist and are reachable by direct URL or via /tools, but the
   * sidebar hides them so beginners aren't drowning in 80 leaf nodes.
   *
   * The "Show all tools" footer toggle flips ui.mode from guided to pro
   * (or back). Settings → UI mode is the explicit knob.
   */
  guided?: boolean;
};

type NavGroup = {
  id: string;
  title: string;
  /** Pinned groups are always visible and not collapsible. */
  pinned?: boolean;
  /** Default-expanded if true; otherwise collapsed by default. */
  defaultOpen?: boolean;
  items: NavItem[];
};

/**
 * Per-group accent. Pre-baked Tailwind class strings so the JIT picks
 * them up — dynamic `text-${color}-300` would silently break.
 *
 * `icon` is the text color applied to each item's lucide icon.
 * `iconActive` is the brighter shade used on the currently-active row.
 * `dot` is the small marker shown beside a collapsed-group header when
 * that group contains the active page.
 * `borderLeft` is the 2px left-edge accent shown on the open-group
 * container so the cluster reads as "you are inside this section".
 */
type GroupAccent = {
  icon: string;
  iconActive: string;
  dot: string;
  borderLeft: string;
  openBg: string;
};

const NEUTRAL_ACCENT: GroupAccent = {
  icon: "text-sidebar-foreground/55",
  iconActive: "text-sidebar-accent-foreground",
  dot: "bg-primary",
  borderLeft: "border-l-2 border-l-primary/40",
  openBg: "bg-sidebar-accent/30",
};

const GROUP_ACCENTS: Record<string, GroupAccent> = {
  essentials: {
    icon: "text-violet-300/70",
    iconActive: "text-violet-200",
    dot: "bg-violet-400",
    borderLeft: "border-l-2 border-l-violet-500/40",
    openBg: "bg-violet-500/[0.08]",
  },
  everyday: {
    icon: "text-cyan-300/70",
    iconActive: "text-cyan-200",
    dot: "bg-cyan-400",
    borderLeft: "border-l-2 border-l-cyan-500/40",
    openBg: "bg-cyan-500/[0.08]",
  },
  content: {
    icon: "text-violet-300/70",
    iconActive: "text-violet-200",
    dot: "bg-violet-400",
    borderLeft: "border-l-2 border-l-violet-500/40",
    openBg: "bg-violet-500/[0.06]",
  },
  keywords: {
    icon: "text-cyan-300/70",
    iconActive: "text-cyan-200",
    dot: "bg-cyan-400",
    borderLeft: "border-l-2 border-l-cyan-500/40",
    openBg: "bg-cyan-500/[0.06]",
  },
  "paid-ads": {
    icon: "text-rose-300/70",
    iconActive: "text-rose-200",
    dot: "bg-rose-400",
    borderLeft: "border-l-2 border-l-rose-500/40",
    openBg: "bg-rose-500/[0.06]",
  },
  backlinks: {
    icon: "text-emerald-300/70",
    iconActive: "text-emerald-200",
    dot: "bg-emerald-400",
    borderLeft: "border-l-2 border-l-emerald-500/40",
    openBg: "bg-emerald-500/[0.06]",
  },
  local: {
    icon: "text-amber-300/70",
    iconActive: "text-amber-200",
    dot: "bg-amber-400",
    borderLeft: "border-l-2 border-l-amber-500/40",
    openBg: "bg-amber-500/[0.06]",
  },
  competitors: {
    icon: "text-cyan-300/70",
    iconActive: "text-cyan-200",
    dot: "bg-cyan-400",
    borderLeft: "border-l-2 border-l-cyan-500/40",
    openBg: "bg-cyan-500/[0.06]",
  },
  "ai-visibility": {
    icon: "text-fuchsia-300/70",
    iconActive: "text-fuchsia-200",
    dot: "bg-fuchsia-400",
    borderLeft: "border-l-2 border-l-fuchsia-500/40",
    openBg: "bg-fuchsia-500/[0.06]",
  },
  monitoring: {
    icon: "text-amber-300/70",
    iconActive: "text-amber-200",
    dot: "bg-amber-400",
    borderLeft: "border-l-2 border-l-amber-500/40",
    openBg: "bg-amber-500/[0.06]",
  },
  imports: {
    icon: "text-emerald-300/70",
    iconActive: "text-emerald-200",
    dot: "bg-emerald-400",
    borderLeft: "border-l-2 border-l-emerald-500/40",
    openBg: "bg-emerald-500/[0.06]",
  },
  deliverables: {
    icon: "text-cyan-300/70",
    iconActive: "text-cyan-200",
    dot: "bg-cyan-400",
    borderLeft: "border-l-2 border-l-cyan-500/40",
    openBg: "bg-cyan-500/[0.06]",
  },
  account: NEUTRAL_ACCENT,
};

/**
 * Sidebar nav after the Phase 2 tool-merge sweep. Tools that were
 * folded into a unified parent (SXO/GEO/E-E-A-T → Audits, Brand SERP /
 * Knowledge Panel / Author authority → Brand visibility, etc.) are
 * no longer listed here. Their URLs still work and they appear in
 * the All tools grid for discovery — they just don't take a sidebar
 * slot. Result: 50+ entries → 25 entries.
 */
const groups: NavGroup[] = [
  {
    id: "essentials",
    title: "Essentials",
    pinned: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, guided: true },
      { href: "/welcome", label: "Get started", icon: Sparkles, guided: true },
      { href: "/clients", label: "Clients", icon: Users, guided: true },
      { href: "/seo-chat", label: "SEO chat", icon: Bot, guided: true },
      { href: "/audits", label: "Audits", icon: ClipboardList, guided: true },
      { href: "/tasks", label: "Tasks", icon: ListChecks, guided: true },
      { href: "/tools", label: "All tools", icon: Wrench, guided: true },
      { href: "/reports", label: "Reports", icon: FileDown, guided: true },
    ],
  },
  {
    id: "everyday",
    title: "Everyday",
    defaultOpen: false,
    items: [
      { href: "/morning", label: "Morning briefing", icon: Activity, guided: true },
      { href: "/digest", label: "Weekly digest", icon: Send },
      { href: "/grader", label: "Instant audit", icon: Sparkles, guided: true },
      { href: "/agent", label: "AI agent", icon: Bot },
      { href: "/capacity", label: "Capacity", icon: Gauge },
      { href: "/activity", label: "Activity log", icon: History },
    ],
  },
  {
    id: "content",
    title: "Content",
    items: [
      { href: "/content", label: "Content overview", icon: FileText, guided: true },
      { href: "/content/calendar", label: "Content calendar", icon: FileText },
      { href: "/blog", label: "AI blog writer", icon: Wand2, guided: true },
      { href: "/content-decay", label: "Content health", icon: TrendingDown, guided: true },
      { href: "/title-tests", label: "Title A/B tests", icon: Wand2 },
      { href: "/meta-rewrite", label: "Meta rewrite batch", icon: Wand2 },
    ],
  },
  {
    id: "keywords",
    title: "Keywords & ranks",
    items: [
      { href: "/keywords", label: "Tracked keywords", icon: Search, guided: true },
      { href: "/cannibalization", label: "Cannibalization", icon: GitMerge },
      { href: "/cwv", label: "Core Web Vitals", icon: Gauge },
      { href: "/serp-scans", label: "SERP scans archive", icon: Globe },
    ],
  },
  {
    id: "paid-ads",
    title: "Paid ads",
    defaultOpen: true,
    items: [
      // The ⭐ marks this as the newest / most-recommended entry —
      // matches the same treatment on /tools and the per-client launcher.
      {
        href: "/tools/ads-funnel",
        label: "Ad Funnel Architect ⭐",
        icon: Megaphone,
      },
      { href: "/tools/branded-split", label: "Branded vs non-branded", icon: Target },
    ],
  },
  {
    id: "backlinks",
    title: "Backlinks & outreach",
    items: [
      { href: "/backlinks", label: "Backlinks", icon: Link2, guided: true },
      { href: "/link-building", label: "Link building", icon: Link2 },
      { href: "/outreach", label: "Outreach", icon: Send },
      { href: "/broken-links", label: "Broken links", icon: Link2 },
    ],
  },
  {
    id: "local",
    title: "Local SEO",
    items: [
      { href: "/gbp", label: "Google Business Profile", icon: Building, guided: true },
      { href: "/citations", label: "Citations", icon: MapPin },
      { href: "/local-rank", label: "Local rank tracker", icon: MapPin },
      { href: "/local-grid", label: "Local rank heatmap", icon: MapPin },
    ],
  },
  {
    id: "competitors",
    title: "Competitors & brand",
    items: [
      { href: "/competitors", label: "Competitors", icon: Network },
      { href: "/brand-monitor", label: "Brand visibility", icon: Network },
      { href: "/compare", label: "Site compare", icon: GitCompare },
    ],
  },
  {
    id: "ai-visibility",
    title: "AI visibility",
    items: [
      { href: "/ai-visibility", label: "AI visibility tracker", icon: Sparkles },
      { href: "/chats", label: "AI chat history", icon: Bot },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring + history",
    items: [
      { href: "/monitor", label: "Page monitor", icon: Activity },
      { href: "/snapshots", label: "Snapshots", icon: ImageIcon },
      { href: "/history", label: "Tool run history", icon: History },
      { href: "/algorithm-updates", label: "Algorithm updates", icon: History },
      { href: "/news", label: "SEO news", icon: Newspaper },
    ],
  },
  {
    id: "imports",
    title: "Imports",
    items: [
      { href: "/import", label: "Import (all sources)", icon: ScanText },
    ],
  },
  {
    id: "deliverables",
    title: "Deliverables",
    items: [
      { href: "/reports/archive", label: "Report archive", icon: FileDown },
      { href: "/automations", label: "Automations", icon: Workflow },
      { href: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    id: "account",
    title: "Account",
    pinned: true,
    items: [
      { href: "/settings", label: "Settings", icon: Settings, guided: true },
      { href: "/learn", label: "Learn", icon: GraduationCap, guided: true },
      { href: "/knowledge", label: "Knowledge hub", icon: GraduationCap },
    ],
  },
];

const COLLAPSED_KEY = "seo:sidebar-collapsed";
const OPEN_GROUPS_KEY = "seo:sidebar-open-groups";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar({
  unreadByHref,
  uiMode = "guided",
}: {
  unreadByHref?: Record<string, number>;
  /**
   * "guided" (default for new users): filters nav to only items marked
   * `guided: true`. Empty groups collapse out of view. ~15 items total
   * across ~7 groups.
   * "pro": shows everything (the historical sidebar).
   */
  uiMode?: "guided" | "pro";
} = {}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const unread = unreadByHref ?? {};

  // Apply the guided/pro filter. In guided mode every item must opt-in
  // via `guided: true`. Pinned groups stay visible even after filtering
  // (Essentials + Account) so the rail always has anchors at top + bottom;
  // non-pinned groups with no surviving items are hidden entirely.
  const visibleGroups: NavGroup[] =
    uiMode === "pro"
      ? groups
      : groups
          .map((g) => ({
            ...g,
            items: g.items.filter((it) => it.guided),
          }))
          .filter((g) => g.pinned || g.items.length > 0);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {}
    try {
      const stored = window.localStorage.getItem(OPEN_GROUPS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, boolean>;
        setOpenGroups(parsed);
      }
    } catch {}
  }, []);

  // Auto-open the group containing the current route — even if the user
  // had it collapsed — so navigation context is always visible. We
  // iterate the FULL groups list (not visibleGroups) because the active
  // route may live in a hidden-by-guided-mode group and we still want
  // to surface it when the user lands there via direct URL.
  useEffect(() => {
    for (const g of groups) {
      if (g.items.some((it) => isActive(pathname, it.href))) {
        setOpenGroups((prev) =>
          prev[g.id] === true ? prev : { ...prev, [g.id]: true },
        );
      }
    }
  }, [pathname]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Trigger the global SearchPalette via its keyboard shortcut. The palette
  // listens for cmd/ctrl+K; we simulate the keypress so we don't have to
  // wire a context.
  function openSearch() {
    const evt = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(evt);
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150 ease-out md:flex md:flex-col ${
        collapsed ? "w-[60px]" : "w-[260px]"
      }`}
    >
      {/* Workspace header — shadcn-admin style: rounded primary mark
          + app name + role/version line beneath + collapse toggle */}
      <div
        className={`flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border ${
          collapsed ? "justify-center px-2" : "px-3"
        }`}
      >
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
          S
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold leading-none text-sidebar-foreground">
                SEO Tool
              </div>
              <div className="mt-1 truncate text-xs text-sidebar-foreground/60">
                v0.1 · local
              </div>
            </div>
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="grid size-7 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PanelLeftOpen className="size-3.5" />
          </button>
        </div>
      )}

      {/* Top-bar already owns the global search (cmd+K). When the
          sidebar is collapsed we still expose a tiny search affordance
          here so users in compact mode can launch the palette without
          expanding the sidebar first. */}
      {collapsed && (
        <div className="flex justify-center py-2">
          <button
            type="button"
            onClick={openSearch}
            title="Search (⌘K)"
            aria-label="Search"
            className="grid size-9 place-items-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Search className="size-4" />
          </button>
        </div>
      )}

      {/* Nav */}
      <LayoutGroup id="sidebar-nav">
      <nav
        className={`flex-1 overflow-y-auto pb-3 ${
          collapsed ? "px-1.5" : "px-2"
        }`}
      >
        {visibleGroups.map((group) => {
          const isOpen =
            group.pinned ||
            (openGroups[group.id] ?? group.defaultOpen ?? false);
          // Group "contains the current page" — used to give the
          // collapsed group header a subtle active indicator so the
          // user can still see which section they're in without
          // expanding it.
          const hasActiveChild = group.items.some((it) =>
            isActive(pathname, it.href),
          );
          const accent = GROUP_ACCENTS[group.id] ?? NEUTRAL_ACCENT;
          return (
            <div
              key={group.id}
              className={`mt-1.5 first:mt-0 ${
                isOpen && !collapsed && !group.pinned
                  ? `rounded-md pb-1 ${accent.openBg} ${accent.borderLeft}`
                  : ""
              }`}
            >
              {!collapsed && !group.pinned && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[13px] font-semibold tracking-tight transition-colors ${
                    isOpen
                      ? "text-sidebar-foreground"
                      : hasActiveChild
                        ? "text-sidebar-foreground/85 hover:text-sidebar-foreground"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {/* Tiny dot when a group has the current page but
                        is collapsed — surfaces "you're in here" without
                        expanding the group. Color-keyed to the group
                        so the user gets a quick "section identity" read. */}
                    {hasActiveChild && !isOpen && (
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${accent.dot}`}
                      />
                    )}
                    {group.title}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="size-3.5 opacity-60" />
                  ) : (
                    <ChevronRight className="size-3.5 opacity-60" />
                  )}
                </button>
              )}
              {!collapsed && group.pinned && (
                <div className="px-2 py-1.5 text-[13px] font-semibold tracking-tight text-sidebar-foreground/75">
                  {group.title}
                </div>
              )}
              {collapsed && (
                <div
                  aria-hidden
                  className="mx-auto my-2 h-px w-5 bg-sidebar-border"
                />
              )}
              {(isOpen || collapsed) && (
                <ul className="mt-0.5">
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
                              ? `relative flex h-9 items-center justify-center rounded-md ${
                                  active
                                    ? "text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                                }`
                              : active
                                ? "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-accent-foreground"
                                : "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                          }
                        >
                          {/* Active background pill — animates between
                              rows via shared layoutId so it slides
                              smoothly when navigation changes. */}
                          {active && (
                            <motion.span
                              layoutId="sidebar-active-pill"
                              className="absolute inset-0 rounded-md bg-sidebar-accent"
                              transition={{
                                type: "spring",
                                stiffness: 380,
                                damping: 30,
                              }}
                            />
                          )}
                          {/* Icon tinted by parent group accent —
                              active rows brighten to the accent's
                              "200" shade. Gives each section its own
                              visual identity without changing the row
                              chrome. */}
                          <Icon
                            className={`relative z-10 shrink-0 size-3.5 transition-colors ${
                              active ? accent.iconActive : accent.icon
                            }`}
                          />
                          {!collapsed && (
                            <span className="relative z-10 flex-1 truncate">
                              {label}
                            </span>
                          )}
                          {unread[href] && unread[href] > 0 ? (
                            collapsed ? (
                              <span
                                aria-label={`${unread[href]} new`}
                                className="absolute right-1 top-1 z-10 size-1.5 rounded-full bg-rose-500"
                              />
                            ) : (
                              <span className="relative z-10 ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded bg-rose-500/15 px-1 text-[10px] font-medium text-rose-300">
                                {unread[href] > 9 ? "9+" : unread[href]}
                              </span>
                            )
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      </LayoutGroup>

      {/* User block + live status — shadcn-admin pattern */}
      <div className="border-t border-sidebar-border">
        {/* User block */}
        <Link
          href="/settings"
          title={collapsed ? "Account · Settings" : undefined}
          className={`flex items-center gap-2 transition-colors hover:bg-sidebar-accent ${
            collapsed ? "h-12 justify-center" : "h-14 px-3"
          }`}
        >
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-semibold text-white">
            SE
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium leading-none text-sidebar-foreground">
                  Local user
                </div>
                <div className="mt-1 truncate text-xs text-sidebar-foreground/60">
                  Single-user mode
                </div>
              </div>
              <ChevronRight className="size-4 text-sidebar-foreground/40" />
            </>
          )}
        </Link>
        {/* Guided/Pro mode toggle. In guided mode the rail is filtered
            down to ~15 essentials; switching to pro reveals all 80+
            entries. Persisted via the ui.mode workspace setting so the
            choice survives reloads. */}
        {!collapsed && (
          <form
            action="/api/ui-mode/toggle"
            method="POST"
            className="border-t border-sidebar-border px-3 py-2"
          >
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              title={
                uiMode === "guided"
                  ? "Reveal every tool in the sidebar"
                  : "Hide advanced tools — keep the essentials only"
              }
            >
              <span className="inline-flex items-center gap-2">
                {uiMode === "guided" ? (
                  <PanelLeftOpen className="size-3.5" />
                ) : (
                  PanelLeftClose && <PanelLeftClose className="size-3.5" />
                )}
                <span>{uiMode === "guided" ? "Show all tools" : "Guided mode"}</span>
              </span>
              <span className="rounded bg-sidebar-accent/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/80">
                {uiMode === "guided" ? "Pro" : "Easy"}
              </span>
            </button>
          </form>
        )}
        {/* Live status pill */}
        <div
          className={`flex items-center gap-2 border-t border-sidebar-border py-2 text-xs text-sidebar-foreground/60 ${
            collapsed ? "justify-center px-2" : "px-3"
          }`}
        >
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {!collapsed && <span>Local · everything on this machine</span>}
        </div>
      </div>
    </aside>
  );
}
