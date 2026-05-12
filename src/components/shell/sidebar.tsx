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
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/welcome", label: "Get started", icon: Sparkles },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/seo-chat", label: "SEO chat", icon: Bot },
      { href: "/audits", label: "Audits", icon: ClipboardList },
      { href: "/tasks", label: "Tasks", icon: ListChecks },
      { href: "/tools", label: "All tools", icon: Wrench },
      { href: "/reports", label: "Reports", icon: FileDown },
    ],
  },
  {
    id: "everyday",
    title: "Everyday",
    defaultOpen: false,
    items: [
      { href: "/morning", label: "Morning briefing", icon: Activity },
      { href: "/digest", label: "Weekly digest", icon: Send },
      { href: "/grader", label: "Instant audit", icon: Sparkles },
      { href: "/agent", label: "AI agent", icon: Bot },
      { href: "/capacity", label: "Capacity", icon: Gauge },
      { href: "/activity", label: "Activity log", icon: History },
    ],
  },
  {
    id: "content",
    title: "Content",
    items: [
      { href: "/content", label: "Content overview", icon: FileText },
      { href: "/content/calendar", label: "Content calendar", icon: FileText },
      { href: "/blog", label: "AI blog writer", icon: Wand2 },
      // GROUP D: Content decay is the most-trafficked of the three
      // (decay / gap / topic clusters). Pointing here until the
      // tabbed Content health hub ships; other URLs remain reachable.
      { href: "/content-decay", label: "Content health", icon: TrendingDown },
      { href: "/title-tests", label: "Title A/B tests", icon: Wand2 },
      { href: "/meta-rewrite", label: "Meta rewrite batch", icon: Wand2 },
    ],
  },
  {
    id: "keywords",
    title: "Keywords & ranks",
    items: [
      { href: "/keywords", label: "Tracked keywords", icon: Search },
      { href: "/cannibalization", label: "Cannibalization", icon: GitMerge },
      { href: "/cwv", label: "Core Web Vitals", icon: Gauge },
      { href: "/serp-scans", label: "SERP scans archive", icon: Globe },
    ],
  },
  {
    id: "backlinks",
    title: "Backlinks & outreach",
    items: [
      { href: "/backlinks", label: "Backlinks", icon: Link2 },
      { href: "/link-building", label: "Link building", icon: Link2 },
      { href: "/outreach", label: "Outreach", icon: Send },
      { href: "/broken-links", label: "Broken links", icon: Link2 },
    ],
  },
  {
    id: "local",
    title: "Local SEO",
    items: [
      { href: "/gbp", label: "Google Business Profile", icon: Building },
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
      // GROUP B: Brand SERP / Knowledge Panel / Author authority
      // folded under a single Brand-monitor entry. Other URLs still
      // resolve via direct nav + All tools grid.
      { href: "/brand-monitor", label: "Brand visibility", icon: Network },
      { href: "/compare", label: "Site compare", icon: GitCompare },
    ],
  },
  {
    id: "ai-visibility",
    title: "AI visibility",
    items: [
      { href: "/ai-visibility", label: "AI visibility tracker", icon: Sparkles },
      // GROUP G: AI bot logs hidden behind Settings → Advanced (still
      // reachable via direct URL).
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
      // GROUP E: 4 import paths consolidated under one Import hub
      // with tabs. Old URLs still resolve.
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
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/learn", label: "Learn", icon: GraduationCap },
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
}: {
  unreadByHref?: Record<string, number>;
} = {}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const unread = unreadByHref ?? {};

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
  // had it collapsed — so navigation context is always visible.
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
      data-shell-chrome="sidebar"
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

      {/* Search row — shadcn-admin uses a faux-input button with a kbd hint */}
      {!collapsed ? (
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={openSearch}
            className="inline-flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background/40 px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">Search…</span>
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
              ⌘K
            </kbd>
          </button>
        </div>
      ) : (
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
        {groups.map((group) => {
          const isOpen =
            group.pinned ||
            (openGroups[group.id] ?? group.defaultOpen ?? false);
          return (
            <div key={group.id} className="mt-1.5 first:mt-0">
              {!collapsed && !group.pinned && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-semibold text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground"
                >
                  <span>{group.title}</span>
                  {isOpen ? (
                    <ChevronDown className="size-3.5 opacity-60" />
                  ) : (
                    <ChevronRight className="size-3.5 opacity-60" />
                  )}
                </button>
              )}
              {!collapsed && group.pinned && (
                <div className="px-2 py-1.5 text-sm font-semibold text-sidebar-foreground/60">
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
                          <Icon
                            className={`relative z-10 shrink-0 size-3.5 ${
                              active ? "text-foreground" : ""
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
