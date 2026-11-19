"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Pin,
  PinOff,
  Search as SearchIcon,
  Wrench,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { useStoredState } from "@/components/use-stored-state";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COLLAPSED_BY_DEFAULT,
  categoryOf,
  isRetired,
  type ToolCategoryId,
} from "@/lib/tool-categories";
import {
  badgeFor,
  capabilityOf,
  worksIn,
  type ConnectionMode,
  type ToolBadge,
} from "@/lib/tool-capabilities";
// The header used to claim "100+ SEO utilities" in hardcoded text while
// a computed count sat one import away, and the real number is 83
// current tools. Rule 4: never a second hardcoded copy of something that
// already exists — least of all a number, which drifts in silence.
import { LISTED_TOOL_COUNT } from "@/lib/connection-coverage";
import { TOOLS } from "@/lib/tool-registry";

// The list itself now lives in lib/tool-registry.ts, so that global
// search, the capability generator and this grid all read one array.
// Ten finished tools were in none of those surfaces when they were four
// separate lists. See that file's header.
const tools = TOOLS;

const accentMap: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};

// Green reads as "costs you nothing", which is the question people are
// actually asking when they scan this grid.
const badgeTone: Record<ToolBadge["tone"], string> = {
  free: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25",
  chat: "bg-violet-500/10 text-violet-300 ring-violet-400/25",
  key: "bg-amber-500/10 text-amber-300 ring-amber-400/25",
  // Deliberately between free and key. These pages work — the main check
  // runs without a model and one feature on them does not — and painting
  // them the same amber as a tool that does nothing without a key was
  // what made four working tools look unavailable.
  partial: "bg-sky-500/10 text-sky-300 ring-sky-400/25",
};

// CATEGORY_ORDER now lives in lib/tool-categories alongside the labels
// and the assignments. It was defined here as a second list of the same
// category ids — the pattern CLAUDE.md's fourth standing rule names, and
// the two would have drifted the moment a category was added.

type Tool = (typeof tools)[number];

const PINNED_KEY = "seo:tools-pinned";

const HIDE_UNUSABLE_KEY = "seo:tools-hide-unusable";
// Module-level so the identity is stable across renders — useStoredState
// keeps `parse` in a useCallback dependency list.
const parseHideUnusable = (raw: string) => raw !== "false";
const serializeHideUnusable = (v: boolean) => (v ? "true" : "false");

/** Stable identity — useSyncExternalStore requires a stable fallback. */
const NO_PINS: ReadonlySet<string> = new Set<string>();

function parsePinned(raw: string): ReadonlySet<string> {
  const arr = JSON.parse(raw);
  return Array.isArray(arr) ? new Set(arr.map(String)) : NO_PINS;
}

const serializePinned = (set: ReadonlySet<string>) =>
  JSON.stringify(Array.from(set));

export function ToolsGrid({ mode = "none" }: { mode?: ConnectionMode }) {
  const [query, setQuery] = useState("");
  // On by default, so someone who has connected nothing sees a grid where
  // everything they click actually works. Persisted, because whichever way
  // they set it is a standing preference, not a per-visit one.
  const [hideUnusable, setHideUnusable] = useStoredState<boolean>(
    HIDE_UNUSABLE_KEY,
    true,
    parseHideUnusable,
  );
  // useSyncExternalStore rather than useState + a hydrate effect: the
  // old version rendered with zero pins, committed that, then re-rendered
  // with the real set — so pinned tools visibly jumped to the top a beat
  // after the page appeared.
  const [pinned, setPinned] = useStoredState<ReadonlySet<string>>(
    PINNED_KEY,
    NO_PINS,
    parsePinned,
  );

  function togglePin(href: string) {
    const next = new Set(pinned);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    setPinned(next, serializePinned);
  }

  // Which collapsed sections the user has opened. Deliberately NOT
  // persisted: "Occasional" being closed is the default state we want on
  // every visit, and remembering that someone once expanded it would
  // slowly undo the whole point.
  const [expanded, setExpanded] = useState<ReadonlySet<ToolCategoryId>>(
    new Set(),
  );

  const q = query.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [q]);

  // Only ever hides tools that genuinely cannot run — the ones that call
  // a model directly, with no key and no Ollama to call.
  //
  // This comment used to say "connect a subscription OR a key and nothing
  // hides". That was true of an earlier worksIn(), which returned true
  // for mode "mcp". It was wrong: MCP runs the other way round — your
  // chat app calls into this one — so a subscription gives these pages
  // nothing to call. worksIn() was fixed and this comment was not, so it
  // sat here describing the bug as if it were the behaviour. A key (or
  // Ollama) is the only thing that unhides them.
  //
  // The count below keeps it honest instead of letting the grid quietly
  // look smaller than the product is.
  const unusableCount = useMemo(
    () =>
      tools.filter(
        (t) => !isRetired(t.href) && !worksIn(capabilityOf(t.href), mode),
      ).length,
    [mode],
  );

  const filteredTools = useMemo(
    () =>
      hideUnusable
        ? searchMatches.filter((t) => worksIn(capabilityOf(t.href), mode))
        : searchMatches,
    [searchMatches, hideUnusable, mode],
  );

  const pinnedTools = useMemo(
    () => tools.filter((t) => pinned.has(t.href)),
    [pinned],
  );

  // Bucket every (filtered) tool into its category, skipping retired
  // ones. Retired means "superseded by a better tool for the same job",
  // not deleted — the routes still work, so bookmarks and links inside
  // old reports keep functioning. They just stop competing for
  // attention with the tool that replaced them.
  const byCategory = new Map<ToolCategoryId, Tool[]>();
  for (const t of filteredTools) {
    if (isRetired(t.href)) continue;
    const cat = categoryOf(t.href);
    const arr = byCategory.get(cat) ?? [];
    arr.push(t);
    byCategory.set(cat, arr);
  }

  const totalMatches = filteredTools.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tools"
        description={`${LISTED_TOOL_COUNT} SEO utilities. Pin the ones you use daily and they'll stick to the top.`}
        icon={Wrench}
        accent="violet"
      />

      {/* Filter row */}
      <div className="sticky top-2 z-20 -mx-2 rounded-2xl border border-white/[0.06] bg-card/70 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tools… (Cmd / Ctrl + K opens global search)"
            className="h-10 w-full rounded-md border border-white/10 bg-background/60 pl-10 pr-10 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {q && (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            {totalMatches} {totalMatches === 1 ? "match" : "matches"}
          </p>
        )}
        {/*
          Why, not just what.

          The badge said "Needs a key" and the reason lived in a hover
          tooltip, so the question people actually asked — "I connected
          Claude, why does this still want a key?" — went unanswered on
          the screen where it comes up. Shown once here rather than
          repeated on thirty-four cards.

          Only when a chat app is connected and a key is not, because
          that is the exact state the confusion comes from. Somebody with
          nothing connected is not surprised that AI tools need AI.
        */}
        {mode === "mcp" && unusableCount > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            <p>
              <strong className="text-foreground">
                Your chat app is connected, and these tools still need a key.
              </strong>{" "}
              That is not a bug. The connection runs one way: your chat app
              calls <em>into</em> this app to read your SEO data. These pages
              need to call <em>out</em> to a model, and they have no chat app
              of their own to ask.
            </p>
            <p className="mt-1.5">
              A key or a local Ollama gives them one — and it is also what
              lets them run overnight, when no chat is open. Free options
              exist: Google AI Studio and Groq both issue keys with no card,
              and Ollama needs no account at all.{" "}
              <Link
                href="/settings#ai"
                className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                Set one up
              </Link>
              .
            </p>
          </div>
        )}

        {/* Only worth showing when something is actually being held back.
            Says the number out loud so the grid never silently shrinks. */}
        {unusableCount > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-muted-foreground">
            <span>
              {hideUnusable
                ? `${unusableCount} tools hidden — they need an AI key.`
                : `${unusableCount} tools need an AI key.`}
            </span>
            <button
              type="button"
              onClick={() =>
                setHideUnusable(!hideUnusable, serializeHideUnusable)
              }
              className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {hideUnusable ? "Show them anyway" : "Hide them"}
            </button>
            <Link
              href="/settings#ai"
              className="rounded text-amber-500 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-amber-300"
            >
              Add a key
            </Link>
            {/* A legend, because a coloured dot only means something once
                somebody has told you what it means. Shown alongside the
                dots rather than in a help page nobody opens. */}
            {!hideUnusable && (
              <span className="inline-flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
                  works now
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/25" />
                  needs a key
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Pinned — only render when the user actually has favorites
          AND we're not filtering (filter takes over the viewport) */}
      {!q && pinnedTools.length > 0 && (
        <section className="space-y-3">
          <header>
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Pin className="size-4 text-amber-300" />
              Pinned
              <span className="text-xs font-normal text-muted-foreground">
                ({pinnedTools.length})
              </span>
            </h2>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pinnedTools.map((t) => (
              <ToolCard
                key={t.href}
                tool={t}
                pinned
                onTogglePin={() => togglePin(t.href)}
                badge={badgeFor(capabilityOf(t.href), mode)}
                usable={worksIn(capabilityOf(t.href), mode)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Category jump-links — hidden while filtering since the
          filtered view shows everything in one flat-ish list */}
      {!q && (
        <nav className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map((cat) => {
            const list = byCategory.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <a
                key={cat}
                href={`#cat-${cat}`}
                className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground"
              >
                {CATEGORY_LABELS[cat].label}
                <span className="rounded-full bg-white/10 px-1.5 text-[10px]">
                  {list.length}
                </span>
              </a>
            );
          })}
        </nav>
      )}

      {totalMatches === 0 && q && (
        <div className="rounded-2xl border border-white/5 bg-card/40 p-10 text-center text-sm text-muted-foreground">
          No tools match &ldquo;{query}&rdquo;. Try a different keyword.
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const list = byCategory.get(cat);
        if (!list || list.length === 0) return null;
        const meta = CATEGORY_LABELS[cat];

        // "Occasional" is collapsed until asked for. It holds the tools
        // that are genuinely useful a few times a year — migrations,
        // one-off generators — and showing them next to the daily ones
        // is what made ninety-nine tools feel like a wall. Filtering
        // expands everything, because then the user has told us what
        // they're looking for.
        const collapsible = COLLAPSED_BY_DEFAULT.includes(cat) && !q;
        const open = !collapsible || expanded.has(cat);

        return (
          <section
            key={cat}
            id={`cat-${cat}`}
            className="scroll-mt-20 space-y-3"
          >
            <header className="space-y-0.5">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat)) next.delete(cat);
                      else next.add(cat);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-2 text-left"
                  aria-expanded={open}
                >
                  <h2 className="text-lg font-semibold tracking-tight">
                    {meta.label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({list.length})
                    </span>
                  </h2>
                  <ChevronDown
                    className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
              ) : (
                <h2 className="text-lg font-semibold tracking-tight">
                  {meta.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({list.length})
                  </span>
                </h2>
              )}
              <p className="text-xs text-muted-foreground">
                {meta.description}
              </p>
            </header>
            {open && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <ToolCard
                    key={t.href}
                    tool={t}
                    pinned={pinned.has(t.href)}
                    onTogglePin={() => togglePin(t.href)}
                    badge={badgeFor(capabilityOf(t.href), mode)}
                usable={worksIn(capabilityOf(t.href), mode)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ToolCard({
  tool,
  pinned,
  onTogglePin,
  badge,
  usable,
}: {
  tool: Tool;
  pinned: boolean;
  onTogglePin: () => void;
  badge: ToolBadge | null;
  /** Will this page actually run with what is connected? */
  usable: boolean;
}) {
  return (
    <div className="glass-apple lift-on-hover group relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <Link
        href={tool.href}
        {...("external" in tool && tool.external
          ? { target: "_blank", rel: "noreferrer noopener" }
          : {})}
        className="relative block p-5"
      >
        <div className="space-y-3">
          <div
            className={`inline-flex size-10 items-center justify-center rounded-xl ring-1 ring-inset ${accentMap[tool.accent]}`}
          >
            <tool.icon className="size-5" />
          </div>
          {/* A dot before the name, so "does this work right now?" is
              answerable at a glance without reading the badge. Green
              runs; amber needs a key. Only shown on tool cards, where
              the capability data is per-tool and accurate — not on
              composed pages, where it over-approximates. */}
          <h3 className="flex items-start gap-2 pr-7 text-base font-semibold">
            {/* 6px with a soft tint was invisible in practice — present
                in the markup, unnoticed on the screen. A ring gives it an
                edge against the card, and the amber is deepened so it
                reads as different at a glance rather than only on
                inspection. */}
            <span
              aria-hidden="true"
              title={usable ? "Ready to use" : "Needs an AI key"}
              className={`mt-[0.4rem] size-2.5 shrink-0 rounded-full ring-2 ${
                usable
                  ? "bg-emerald-500 ring-emerald-500/20"
                  : "bg-amber-500 ring-amber-500/25"
              }`}
            />
            <span className="min-w-0 flex-1">{tool.title}</span>
            <span className="sr-only">
              {usable ? " (ready to use)" : " (needs an AI key)"}
            </span>
          </h3>
          <p className="text-sm text-muted-foreground">{tool.description}</p>
          {badge && (
            <span
              title={badge.detail}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${badgeTone[badge.tone]}`}
            >
              {badge.label}
            </span>
          )}
        </div>
      </Link>
      {/* Pin button is a sibling of the Link so clicks on it don't
          navigate to the tool. Visible on hover or when already pinned. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTogglePin();
        }}
        title={pinned ? "Unpin from top" : "Pin to top"}
        aria-label={pinned ? "Unpin tool" : "Pin tool"}
        className={`absolute right-3 top-3 grid size-7 place-items-center rounded-md transition-all ${
          pinned
            ? "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30 opacity-100"
            : "text-muted-foreground opacity-0 ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground group-hover:opacity-100"
        }`}
      >
        {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
      </button>
    </div>
  );
}
