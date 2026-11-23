"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Repeat,
  Search,
  Wrench,
  X,
} from "lucide-react";
import {
  buildClientToolGroups,
  type ClientToolLink,
  type ClientToolsClient,
} from "./client-tools-launcher";
import { ToolDot, ToolDotLegend } from "@/components/tool-dot";
import { NEEDS_HINT_KEYS, toolReadiness } from "@/lib/tool-readiness";
import {
  allMappedGroups,
  groupsForSurfaces,
  type SurfaceId,
} from "@/lib/engagement-surfaces";
import { isToolDisabled } from "@/lib/tool-catalog";
import { toolKey } from "@/lib/project-tools";
import type { OpenToolState } from "./client-tools-panel";

/**
 * Per-client tool launcher as a secondary sidebar. Compact, scannable,
 * sticky on desktop. Mobile collapses to a button + sheet so the main
 * content gets full width on phone-size viewports.
 *
 * With `featured`, the rail shows those few tools (picked from the tab and
 * the project's missions, lib/project-tools.ts) and folds the forty behind
 * "All tools". Search still looks through all forty.
 *
 * Design choices that took two iterations to land on:
 *  - 280px wide so 2-line titles + 2-line blurbs don't get crushed
 *  - Group "needs setup" surface as a small lock-icon hover-tooltip,
 *    not a chunky amber badge — the badge was dominating visual weight
 *  - Search input is sticky at the top of the scroll area so the user
 *    never has to scroll up to filter
 */
export function ClientToolsSidebar({
  client,
  hasAiKey = false,
  surfaces,
  featured,
  onOpenTool,
  top,
  disabledTools,
}: {
  /** Tools turned off in Settings → Tools: left out of the rail. */
  disabledTools?: string[];
  /** Shown above the rail, first in the stack (the client action plan). */
  top?: React.ReactNode;
  client: ClientToolsClient;
  /**
   * What this engagement covers. Groups belonging to a chosen surface
   * sort first and stay open; the rest fall below a divider, collapsed.
   * Ordering, not gating — every tool is still one click away, because
   * a scope decision made during onboarding should not stop somebody
   * using a tool they want today.
   */
  surfaces?: SurfaceId[];
  /** Tools put forward, as lib/project-tools.ts keys, in order. */
  featured?: string[];
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
  const t = useTranslations("clientPage.tools");
  const tDot = useTranslations("shell.toolDot");
  const off = new Set(disabledTools ?? []);
  // Names and blurbs in the reader's language (clientPage.tools.items,
  // keyed by the tool's path). `label` stays the English one: the scope
  // tables below match on it; `shownLabel` is what is drawn.
  const itemKey = (href: string) =>
    toolKey(href, client.id).replace(/\/:id/g, "").replace(/^\//, "").replace(/\//g, "_");
  const groupKey = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const allGroups = buildClientToolGroups(client)
    .map((g) => ({
      ...g,
      shownLabel: t.has(`groups.${groupKey(g.label)}`) ? t(`groups.${groupKey(g.label)}`) : g.label,
      tools: g.tools
        .filter((tool) => !isToolDisabled(tool.href, off))
        .map((tool) => {
          const k = itemKey(tool.href);
          return t.has(`items.${k}.title`)
            ? { ...tool, title: t(`items.${k}.title`), blurb: t(`items.${k}.blurb`) }
            : tool;
        }),
    }))
    .filter((g) => g.tools.length > 0);

  // Scope order. Groups no surface claims — "Paid ads & growth" — keep
  // their place among the in-scope ones rather than being demoted:
  // unmapped is not the same as declined, and treating it as such would
  // quietly bury a tool nobody decided about.
  const scoped = surfaces && surfaces.length > 0 ? groupsForSurfaces(surfaces) : null;
  const mapped = new Set(allMappedGroups());
  const outOfScope = new Set(
    scoped ? [...mapped].filter((g) => !scoped.includes(g)) : [],
  );
  const groups = scoped
    ? [...allGroups].sort((a, b2) => {
        const rank = (label: string) =>
          outOfScope.has(label) ? 2 : scoped.indexOf(label) === -1 ? 1 : 0;
        const d = rank(a.label) - rank(b2.label);
        if (d !== 0) return d;
        return scoped.indexOf(a.label) - scoped.indexOf(b2.label);
      })
    : allGroups;

  // The featured tools, in the order asked for. A key the rail does not
  // have is skipped (lib/project-tools.test.ts keeps that from happening).
  const byKey = new Map(
    allGroups.flatMap((g) => g.tools).map((tool) => [toolKey(tool.href, client.id), tool] as const),
  );
  const featuredTools = (featured ?? [])
    .map((k) => byKey.get(k))
    .filter((tool): tool is ClientToolLink => Boolean(tool));
  const hasFeatured = featuredTools.length > 0;

  const [query, setQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    // Out-of-scope groups start closed. Seeded once from the initial
    // scope rather than derived every render, so a user who opens one
    // does not have it snap shut again.
    () =>
      new Set(
        surfaces && surfaces.length > 0
          ? allMappedGroups().filter(
              (g) => !groupsForSurfaces(surfaces).includes(g),
            )
          : [],
      ),
  );

  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? groups
        .map((g) => ({
          ...g,
          tools: g.tools.filter(
            (tool) =>
              tool.title.toLowerCase().includes(q) ||
              tool.blurb.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.tools.length > 0)
    : groups;

  const toolCount = groups.reduce((s, g) => s + g.tools.length, 0);
  const shownCount = hasFeatured && !showAll ? featuredTools.length : toolCount;
  const blockedCount = groups.reduce(
    (s, g) =>
      s +
      g.tools.filter(
        (tool) =>
          toolReadiness({ href: tool.href, needs: tool.needs, hasAiKey }).state ===
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

  function toolItem(tool: ClientToolLink, accent: Accent) {
    const Icon = tool.icon;
    return (
      <li key={tool.href}>
        <Link
          href={tool.href}
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
              onOpenTool({ url: tool.href, title: tool.title });
            }
          }}
          className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/[0.05]"
        >
          <span
            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ring-1 ring-inset ${accent.iconBg}`}
          >
            <Icon className={`size-3 ${accent.icon}`} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              {/* Same dot, same rule, as the main sidebar and the
                  launcher cards: lib/tool-readiness.ts decides all of
                  them, so a tool never gets two answers. */}
              <ToolDot
                href={tool.href}
                needs={tool.needs}
                hasAiKey={hasAiKey}
                className="mt-px"
              />
              <span
                className={`block flex-1 truncate text-[13px] font-medium leading-tight transition-colors ${accent.hoverText}`}
              >
                {tool.title}
              </span>
              {tool.autoRuns && (
                /* This one already runs nightly. It stays
                   openable — the point is that opening it
                   is no longer how the check happens. */
                <span
                  title={t("autoRuns")}
                  className="grid size-4 shrink-0 place-items-center rounded text-emerald-400/80"
                >
                  <Repeat className="size-3" />
                </span>
              )}
              {tool.needs && (
                <span
                  title={tDot(NEEDS_HINT_KEYS[tool.needs])}
                  className="grid size-4 shrink-0 place-items-center rounded text-amber-300/80"
                >
                  <Lock className="size-3" />
                </span>
              )}
            </span>
            <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {tool.blurb}
            </span>
          </span>
        </Link>
      </li>
    );
  }

  const groupList = (
    <div className="space-y-2">
      {filteredGroups.length === 0 && (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">
          {t("noMatch", { query })}
        </p>
      )}
      {filteredGroups.map((g, gIdx) => {
        const collapsed = !q && collapsedGroups.has(g.label);
        // First group past the scope boundary gets the divider, so the
        // client's agreed scope is visible here and not only in the PDF.
        const firstOut =
          outOfScope.has(g.label) &&
          !filteredGroups
            .slice(0, gIdx)
            .some((prev) => outOfScope.has(prev.label));
        return (
          <section key={g.label}>
            {firstOut && !q && (
              <p className="mb-1 mt-3 flex items-center gap-2 px-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
                <span className="h-px flex-1 bg-border" />
                {t("outOfScope")}
                <span className="h-px flex-1 bg-border" />
              </p>
            )}
            <button
              type="button"
              onClick={() => toggleGroup(g.label)}
              className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span className="flex-1 truncate text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
                {g.shownLabel}
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
                {g.tools.map((tool) => toolItem(tool, ACCENT))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );

  // Inner list — re-used in both desktop sticky panel and mobile sheet
  const list = (
    <>
      <div className="sticky top-0 z-10 -mx-2.5 -mt-2.5 mb-2 border-b border-border bg-card/95 px-2.5 py-2 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filter", { count: toolCount })}
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-8 pr-8 text-xs placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label={t("clearFilter")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {q ? (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {t("matches", {
              count: filteredGroups.reduce((s, g) => s + g.tools.length, 0),
            })}
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
                className="text-[10px] text-amber-600 underline decoration-dotted underline-offset-2 hover:text-amber-500 dark:text-amber-300/90"
              >
                {t("needSetup", { count: blockedCount })}
              </Link>
            )}
          </div>
        )}
      </div>

      {q || !hasFeatured ? (
        groupList
      ) : (
        <>
          <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
            {t("featured")}
          </p>
          <ul className="space-y-px">{featuredTools.map((tool) => toolItem(tool, ACCENT))}</ul>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mt-3 flex w-full items-center gap-2 rounded-md border-t border-border px-1 pb-1 pt-3 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAll ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <span className="flex-1">{t("allTools", { count: toolCount })}</span>
          </button>
          {showAll && <div className="mt-1">{groupList}</div>}
        </>
      )}

      <p className="mt-4 px-1 text-[10px] text-muted-foreground/70">
        <Link
          href="/settings/tools"
          className="hover:text-foreground hover:underline"
        >
          {t("toolbox")}
        </Link>
      </p>
    </>
  );

  return (
    <>
      {/* Mobile: floating button that opens a sheet */}
      <div className="space-y-2 md:hidden">
        {top}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary/10 px-3 text-xs font-medium text-primary ring-1 ring-inset ring-primary/30 hover:bg-primary/15"
        >
          <Wrench className="size-3.5" />
          {t("title")} ({shownCount})
        </button>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <div
              className="absolute right-0 top-0 h-full w-[320px] max-w-[85vw] overflow-y-auto border-l border-border bg-card p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Wrench className="size-4 text-primary" />
                  {t("title")}
                </h3>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label={t("close")}
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

      {/* Desktop: sticky secondary sidebar. Its height follows what it
          shows, up to the viewport, so five tools are not a tall box. */}
      <div className="sticky top-4 hidden w-[280px] shrink-0 flex-col gap-3 md:flex">
      {top}
      <aside className="flex max-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Wrench className="size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold leading-tight">
              {t("title")}
            </h3>
          </div>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {shownCount}
          </span>
        </header>
        <div className="overflow-y-auto px-2.5 pb-3 pt-2.5">{list}</div>
      </aside>
      </div>
    </>
  );
}

/**
 * One accent for every tool, the brand's (docs/HANDOFF.md §C: a single
 * accent colour, no per-group rainbow). Classes written out in full so
 * Tailwind's JIT sees them.
 */
const ACCENT = {
  iconBg: "bg-primary/10 ring-primary/20",
  icon: "text-primary",
  hoverText: "group-hover:text-primary",
} as const;

type Accent = typeof ACCENT;
