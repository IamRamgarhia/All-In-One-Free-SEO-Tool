"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search, Wrench, X } from "lucide-react";
import {
  buildClientToolGroups,
  CLIENT_TOOL_NEEDS_HINTS,
  type ClientToolsClient,
} from "./client-tools-launcher";
import { ToolDot, ToolDotLegend } from "@/components/tool-dot";
import { toolReadiness } from "@/lib/tool-readiness";
import type { OpenToolState } from "./client-tools-panel";

/**
 * Per-client tool launcher as a secondary sidebar. Compact, scannable,
 * sticky on desktop. Mobile collapses to a button + sheet so the main
 * content gets full width on phone-size viewports.
 *
 * Design choices that took two iterations to land on:
 *  - 280px wide so 2-line titles + 2-line blurbs don't get crushed
 *  - Group "needs setup" surface as a small lock-icon hover-tooltip,
 *    not a chunky amber badge — the badge was dominating visual weight
 *  - Per-group colored dot + tool-count chip so the section list is
 *    scannable at a glance
 *  - Search input is sticky at the top of the scroll area so the user
 *    never has to scroll up to filter
 */
export function ClientToolsSidebar({
  client,
  hasAiKey = false,
  onOpenTool,
}: {
  client: ClientToolsClient;
  /**
   * Whether this app can call a model — a provider key or Ollama. A
   * connected chat subscription is NOT this: MCP runs the other way
   * round, so it gives these pages nothing to call.
   */
  hasAiKey?: boolean;
  /**
   * Fired when the user left-clicks a tool. The sidebar passes
   * { url, title } and the parent decides what to do (open drawer
   * vs navigate). Modifier-clicks bypass this and follow the link.
   */
  onOpenTool?: (tool: OpenToolState) => void;
}) {
  const groups = buildClientToolGroups(client);
  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? groups
        .map((g) => ({
          ...g,
          tools: g.tools.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.blurb.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.tools.length > 0)
    : groups;

  const toolCount = groups.reduce((s, g) => s + g.tools.length, 0);
  const blockedCount = groups.reduce(
    (s, g) =>
      s +
      g.tools.filter(
        (t) =>
          toolReadiness({ href: t.href, needs: t.needs, hasAiKey }).state ===
          "blocked",
      ).length,
    0,
  );

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  // Inner list — re-used in both desktop sticky panel and mobile sheet
  const list = (
    <>
      <div className="sticky top-0 z-10 -mx-2.5 -mt-2.5 mb-2 border-b border-white/[0.04] bg-card/95 px-2.5 py-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools…"
            className="h-9 w-full rounded-md border border-white/10 bg-background/60 pl-8 pr-8 text-xs placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {q ? (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {filteredGroups.reduce((s, g) => s + g.tools.length, 0)} match
            {filteredGroups.reduce((s, g) => s + g.tools.length, 0) === 1
              ? ""
              : "es"}
          </p>
        ) : (
          /* What the dots mean, in the one place you can't scroll past.
             A colored dot with no key is a puzzle, and the dot exists to
             save a click rather than add one. */
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <ToolDotLegend />
            {blockedCount > 0 && (
              <Link
                href="/settings#ai"
                className="text-[10px] text-amber-300/90 underline decoration-dotted underline-offset-2 hover:text-amber-200"
              >
                {blockedCount} need setup
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filteredGroups.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            No tools match &ldquo;{query}&rdquo;.
          </p>
        )}
        {filteredGroups.map((g, gIdx) => {
          const collapsed = collapsedGroups.has(g.label);
          const groupAccent = GROUP_ACCENTS[gIdx % GROUP_ACCENTS.length];
          return (
            <section key={g.label}>
              <button
                type="button"
                onClick={() => toggleGroup(g.label)}
                className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${groupAccent.dot}`}
                />
                <span className="flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
                  {g.label}
                </span>
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">
                  {g.tools.length}
                </span>
                {collapsed ? (
                  <ChevronRight className="size-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3 text-muted-foreground" />
                )}
              </button>
              {!collapsed && (
                <ul className="mt-1 space-y-px">
                  {g.tools.map((t) => {
                    const Icon = t.icon;
                    return (
                      <li key={t.href}>
                        <Link
                          href={t.href}
                          onClick={(e) => {
                            setMobileOpen(false);
                            // Only intercept plain left-click. Mod-click
                            // (ctrl / cmd / shift / middle) keeps the
                            // default behavior (new tab, etc.) so power
                            // users can still fan out the standalone view.
                            if (
                              onOpenTool &&
                              !e.metaKey &&
                              !e.ctrlKey &&
                              !e.shiftKey &&
                              !e.altKey
                            ) {
                              e.preventDefault();
                              onOpenTool({ url: t.href, title: t.title });
                            }
                          }}
                          className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.05]"
                        >
                          <span
                            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ring-1 ring-inset ${groupAccent.iconBg}`}
                          >
                            <Icon className={`size-3 ${groupAccent.icon}`} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              {/* Same dot, same rule, as the main
                                  sidebar and the launcher cards. This
                                  rail is where you actually pick a tool
                                  for a client, and it was the one panel
                                  that said nothing about whether the
                                  tool would run when you got there. */}
                              <ToolDot
                                href={t.href}
                                needs={t.needs}
                                hasAiKey={hasAiKey}
                                className="mt-px"
                              />
                              <span
                                className={`block flex-1 truncate text-[13px] font-medium leading-tight transition-colors ${groupAccent.hoverText}`}
                              >
                                {t.title}
                              </span>
                              {t.needs && (
                                <span
                                  title={CLIENT_TOOL_NEEDS_HINTS[t.needs]}
                                  className="grid size-4 shrink-0 place-items-center rounded text-amber-300/80"
                                >
                                  <Lock className="size-3" />
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                              {t.blurb}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-4 px-1 text-[10px] text-muted-foreground/70">
        <Link
          href="/tools"
          className="hover:text-foreground hover:underline"
        >
          Browse all tools →
        </Link>
      </p>
    </>
  );

  return (
    <>
      {/* Mobile: floating button that opens a sheet */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-500/15 px-3 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
        >
          <Wrench className="size-3.5" />
          Tools for this client ({toolCount})
        </button>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <div
              className="absolute right-0 top-0 h-full w-[320px] max-w-[85vw] overflow-y-auto border-l border-white/10 bg-card p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Wrench className="size-4 text-violet-300" />
                  Tools for this client
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>
              {list}
            </div>
          </div>
        )}
      </div>

      {/* Desktop: sticky secondary sidebar */}
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[280px] shrink-0 overflow-hidden rounded-2xl border border-white/[0.06] bg-card/60 backdrop-blur-md md:flex md:flex-col">
        <header className="flex items-center gap-2 border-b border-white/[0.06] bg-violet-500/[0.04] px-3 py-2">
          <Wrench className="size-3.5 shrink-0 text-violet-300" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold leading-tight">
              Tools for this client
            </h3>
          </div>
          <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {toolCount}
          </span>
        </header>
        <div className="flex-1 overflow-y-auto px-2.5 pb-3 pt-2.5">{list}</div>
      </aside>
    </>
  );
}

/**
 * Color rotation for group accents. 7 colors cycle through the ~8 groups
 * — enough variation to scan visually without overwhelming. Each entry
 * is pre-baked Tailwind so the JIT picks it up (dynamic class names
 * would silently fail).
 */
const GROUP_ACCENTS = [
  {
    dot: "bg-violet-400",
    iconBg: "bg-violet-500/10 ring-violet-500/20",
    icon: "text-violet-300",
    hoverText: "group-hover:text-violet-200",
  },
  {
    dot: "bg-cyan-400",
    iconBg: "bg-cyan-500/10 ring-cyan-500/20",
    icon: "text-cyan-300",
    hoverText: "group-hover:text-cyan-200",
  },
  {
    dot: "bg-emerald-400",
    iconBg: "bg-emerald-500/10 ring-emerald-500/20",
    icon: "text-emerald-300",
    hoverText: "group-hover:text-emerald-200",
  },
  {
    dot: "bg-rose-400",
    iconBg: "bg-rose-500/10 ring-rose-500/20",
    icon: "text-rose-300",
    hoverText: "group-hover:text-rose-200",
  },
  {
    dot: "bg-amber-400",
    iconBg: "bg-amber-500/10 ring-amber-500/20",
    icon: "text-amber-300",
    hoverText: "group-hover:text-amber-200",
  },
  {
    dot: "bg-sky-400",
    iconBg: "bg-sky-500/10 ring-sky-500/20",
    icon: "text-sky-300",
    hoverText: "group-hover:text-sky-200",
  },
  {
    dot: "bg-fuchsia-400",
    iconBg: "bg-fuchsia-500/10 ring-fuchsia-500/20",
    icon: "text-fuchsia-300",
    hoverText: "group-hover:text-fuchsia-200",
  },
] as const;
