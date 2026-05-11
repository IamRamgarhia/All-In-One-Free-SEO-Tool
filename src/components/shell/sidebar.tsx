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
      { href: "/ask", label: "Ask the tool", icon: Bot },
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
      { href: "/content-decay", label: "Content decay", icon: TrendingDown },
      { href: "/content-gap", label: "Content gap", icon: GitCompare },
      { href: "/topic-clusters", label: "Topic clusters", icon: Layers },
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
      { href: "/landing-perf", label: "Landing-page perf", icon: Gauge },
      { href: "/serp-scans", label: "SERP scans archive", icon: Globe },
    ],
  },
  {
    id: "backlinks",
    title: "Backlinks & outreach",
    items: [
      { href: "/backlinks", label: "Backlinks", icon: Link2 },
      { href: "/link-building", label: "Link building", icon: Link2 },
      { href: "/link-building/prospects", label: "Find prospects", icon: Link2 },
      { href: "/link-building/library", label: "Library (314 sites)", icon: Globe },
      { href: "/outreach", label: "Outreach", icon: Send },
      { href: "/outreach/templates", label: "Outreach templates", icon: Send },
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
      { href: "/competitors/playbook", label: "Competitor playbook", icon: Network },
      { href: "/brand-monitor", label: "Brand monitor", icon: Network },
      { href: "/brand-serp", label: "Brand SERP", icon: Network },
      { href: "/knowledge-panel", label: "Knowledge Panel", icon: Globe },
      { href: "/author-authority", label: "Author authority", icon: Users },
      { href: "/compare", label: "Site compare", icon: GitCompare },
    ],
  },
  {
    id: "ai-visibility",
    title: "AI visibility",
    items: [
      { href: "/ai-visibility", label: "AI visibility tracker", icon: Sparkles },
      { href: "/bot-logs", label: "AI bot logs", icon: Bot },
      { href: "/chats", label: "AI chat history", icon: Bot },
    ],
  },
  {
    id: "monitoring",
    title: "Monitoring + history",
    items: [
      { href: "/monitor", label: "Page monitor", icon: Activity },
      { href: "/snapshots", label: "Snapshots", icon: ImageIcon },
      { href: "/annotations", label: "Chart annotations", icon: History },
      { href: "/history", label: "Tool run history", icon: History },
      { href: "/algorithm-updates", label: "Algorithm updates", icon: History },
      { href: "/news", label: "SEO news", icon: Newspaper },
    ],
  },
  {
    id: "imports",
    title: "Imports",
    items: [
      { href: "/import", label: "Import screenshot", icon: ScanText },
      { href: "/capture", label: "Universal capture", icon: Magnet },
      { href: "/csv-import", label: "CSV import", icon: FileDown },
      { href: "/image-audit", label: "Image audit", icon: ImageIcon },
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
      className={`hidden shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-150 ease-out md:flex md:flex-col ${
        collapsed ? "w-[60px]" : "w-[232px]"
      }`}
    >
      {/* Workspace block — Linear-style: small square mark + name + chevron */}
      <div
        className={`flex h-[52px] shrink-0 items-center gap-2 border-b border-sidebar-border ${
          collapsed ? "justify-center px-2" : "px-3"
        }`}
      >
        <div className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
          S
        </div>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-foreground">
              SEO tool
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-3.5" />
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

      {/* Search row */}
      {!collapsed ? (
        <div className="px-2 py-2">
          <button
            type="button"
            onClick={openSearch}
            className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="flex-1 truncate">Search…</span>
            <kbd className="hidden rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
              ⌘K
            </kbd>
          </button>
        </div>
      ) : (
        <div className="flex justify-center py-1">
          <button
            type="button"
            onClick={openSearch}
            title="Search (⌘K)"
            aria-label="Search"
            className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="size-3.5" />
          </button>
        </div>
      )}

      {/* Nav */}
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
            <div key={group.id} className="mt-3 first:mt-1">
              {!collapsed && !group.pinned && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{group.title}</span>
                  {isOpen ? (
                    <ChevronDown className="size-3 opacity-60" />
                  ) : (
                    <ChevronRight className="size-3 opacity-60" />
                  )}
                </button>
              )}
              {!collapsed && group.pinned && (
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
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
                              ? `relative flex h-8 items-center justify-center rounded ${
                                  active
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                }`
                              : active
                                ? "relative flex items-center gap-2 rounded px-2 py-1.5 text-[13px] font-medium text-foreground bg-accent"
                                : "relative flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          }
                        >
                          <Icon
                            className={`shrink-0 size-3.5 ${
                              active ? "text-foreground" : ""
                            }`}
                          />
                          {!collapsed && (
                            <span className="flex-1 truncate">{label}</span>
                          )}
                          {unread[href] && unread[href] > 0 ? (
                            collapsed ? (
                              <span
                                aria-label={`${unread[href]} new`}
                                className="absolute right-1 top-1 size-1.5 rounded-full bg-rose-500"
                              />
                            ) : (
                              <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded bg-rose-500/15 px-1 text-[10px] font-medium text-rose-300">
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

      {/* Footer status */}
      <div
        className={`border-t border-sidebar-border py-2 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        <div
          className={`flex items-center gap-2 text-[11px] text-muted-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {!collapsed && <span>Local</span>}
        </div>
      </div>
    </aside>
  );
}
