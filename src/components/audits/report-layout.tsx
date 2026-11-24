"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ReportNavItem = {
  id: string;
  label: string;
  /** Category score, shown as a pill */
  score?: number;
  /** Open failures and warnings, shown as a count */
  fail?: number;
  warn?: number;
  /** A muted line under the label, e.g. "not measured" */
  hint?: string;
  /** What the count means, read out and shown on hover ("54 checks to review"). */
  issuesLabel?: string;
};

export type ReportNavGroup = { label: string; items: ReportNavItem[] };

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const readHash = () => {
  const raw = window.location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    // A malformed escape like "#%E0" must not crash the report.
    return raw;
  }
};
const noHash = () => "";

/**
 * The audit report as a page inside the page: a sidebar that lists every
 * section the audit covers, top to bottom, and one section shown at a time,
 * the way Settings pages read. The section follows the URL hash, so a link
 * to `#cat-links` or to a rule inside it (`#rule-links-broken-internal`)
 * opens the right section, and the browser's back button walks between them.
 * Every section is rendered on the server; this only toggles which one shows.
 */
export function ReportLayout({
  groups,
  panels,
  navLabel,
}: {
  groups: ReportNavGroup[];
  panels: { id: string; content: ReactNode }[];
  navLabel: string;
}) {
  const hash = useSyncExternalStore(subscribe, readHash, noHash);
  const contentRef = useRef<HTMLDivElement>(null);
  const ids = panels.map((p) => p.id);
  // A hash can name a section or something inside one (a rule).
  const owner =
    typeof document === "undefined" || !hash
      ? null
      : ids.includes(hash)
        ? hash
        : (document.getElementById(hash)?.closest<HTMLElement>("[data-panel]")?.dataset.panel ?? null);
  const active = owner ?? ids[0];

  useEffect(() => {
    // Keep the picked tab in view in the phone tab bar.
    // Only the bar scrolls: scrollIntoView would also move the page.
    const tab = document.querySelector<HTMLElement>(`[data-tab="${CSS.escape(active)}"]`);
    const bar = tab?.closest("nav");
    if (tab && bar) bar.scrollTo({ left: tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2 });
    if (!hash) return;
    if (ids.includes(hash)) {
      // A new section starts at its top, but don't jump when that is in view.
      const box = contentRef.current;
      if (box && box.getBoundingClientRect().top < 120) box.scrollIntoView({ block: "start" });
    } else {
      document.getElementById(hash)?.scrollIntoView({ block: "start" });
    }
    // Only on navigation: the ids are stable for one report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, active]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Phones get SEOmator's tab bar: one scrollable row pinned to the top. */}
      <nav
        aria-label={navLabel}
        className="sticky top-0 z-20 -mx-3 overflow-x-auto border-b border-white/5 bg-background/90 px-3 py-2 sm:-mx-4 sm:px-4 backdrop-blur-md [scrollbar-width:none] lg:hidden"
      >
        <ul className="flex w-max gap-2">
          {groups.flatMap((group) => group.items).map((item) => (
            <li key={item.id} data-tab={item.id}>
              <TabLink item={item} active={item.id === active} />
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label={navLabel} className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <div className="space-y-5 overflow-y-auto rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md lg:max-h-[calc(100vh-8rem)]">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <NavLink item={item} active={item.id === active} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div ref={contentRef} className="min-w-0 scroll-mt-20 lg:scroll-mt-6">
        {panels.map((p) => (
          <div key={p.id} id={p.id} data-panel={p.id} hidden={p.id !== active} className="space-y-6">
            {p.content}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabLink({ item, active }: { item: ReportNavItem; active: boolean }) {
  const issues = (item.fail ?? 0) + (item.warn ?? 0);
  return (
    <a
      href={`#${item.id}`}
      aria-current={active ? "location" : undefined}
      className={cn(
        "flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-cyan-400/50 bg-cyan-400/15 text-foreground"
          : "border-white/10 bg-white/[0.03] text-muted-foreground",
      )}
    >
      {item.label}
      {item.score != null ? (
        <span
          className={cn(
            "font-mono tabular-nums",
            item.score >= 80 ? "text-emerald-300" : item.score >= 60 ? "text-amber-300" : "text-rose-300",
          )}
        >
          {item.score}
        </span>
      ) : issues > 0 ? (
        <span className={item.fail ? "text-rose-300" : "text-amber-300"} title={item.issuesLabel}>
          <span aria-hidden={item.issuesLabel ? true : undefined}>{issues}</span>
          {item.issuesLabel ? <span className="sr-only">{item.issuesLabel}</span> : null}
        </span>
      ) : null}
    </a>
  );
}

function NavLink({ item, active }: { item: ReportNavItem; active: boolean }) {
  const issues = (item.fail ?? 0) + (item.warn ?? 0);
  const dot =
    item.score == null
      ? null
      : item.fail
        ? "bg-rose-400"
        : item.warn
          ? "bg-amber-400"
          : "bg-emerald-400";
  return (
    <a
      href={`#${item.id}`}
      aria-current={active ? "location" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-white/10 text-foreground before:absolute before:inset-y-1.5 before:-left-3 before:w-0.5 before:rounded-full before:bg-cyan-400"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dot)} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.hint ? <span className="block truncate text-[10px] text-muted-foreground/70">{item.hint}</span> : null}
      </span>
      {issues > 0 ? (
        <span
          className={cn(
            "rounded px-1.5 text-[11px] tabular-nums",
            item.fail ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300",
          )}
          title={item.issuesLabel}
        >
          <span aria-hidden={item.issuesLabel ? true : undefined}>{issues}</span>
          {item.issuesLabel ? <span className="sr-only">{item.issuesLabel}</span> : null}
        </span>
      ) : null}
      {item.score != null ? (
        <span
          className={cn(
            "w-8 text-right font-mono text-[11px] tabular-nums",
            item.score >= 80 ? "text-emerald-300" : item.score >= 60 ? "text-amber-300" : "text-rose-300",
          )}
        >
          {item.score}
        </span>
      ) : null}
    </a>
  );
}
