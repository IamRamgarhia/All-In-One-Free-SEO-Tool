"use client";

import { useEffect, useState } from "react";

export type PageTab = {
  /** Tab id, used as the panel's data attribute. */
  id: string;
  label: string;
  /** Section element ids this tab shows. Every section belongs to exactly one tab. */
  sections: readonly string[];
  /** Highlighted — the thing a new install needs first. */
  primary?: boolean;
};

/**
 * Turn one very long page into a few tabs.
 *
 * Written for Settings, which was ~760 lines of stacked cards, and then
 * wanted by two longer pages — the per-client page at ~1,315 lines and
 * the knowledge hub at ~1,240. Hence this being a shared component
 * rather than the third copy of it: every pair of hardcoded lists in
 * this codebase had already drifted by the time anyone noticed.
 *
 * It hides rather than unmounts. Every section stays server-rendered and
 * in the DOM in its original order, and one generated stylesheet hides
 * the ones outside the active tab. That matters for two reasons: a form
 * in a hidden tab keeps whatever the user typed, and nothing has to be
 * reordered or re-parented to adopt it — which on files this size is
 * where the damage would come from.
 *
 * The cost of hiding rather than unmounting is that work still happens
 * for tabs nobody opens, so it suits pages whose sections are already
 * rendered together. It is the wrong tool for a tab that should only
 * fetch when opened.
 *
 * Deep links keep working, from outside the page and from within it.
 */
export function PageTabs({
  tabs,
  panelId,
  panelClassName = "space-y-5",
  children,
}: {
  tabs: readonly PageTab[];
  /**
   * Id for the panel wrapper. Must be unique per page, because the
   * generated CSS selects on it.
   */
  panelId: string;
  /**
   * Spacing for the panel wrapper. Defaults to the Settings page's
   * rhythm; pages that stack their sections further apart pass their own
   * so adopting tabs does not also change the layout.
   */
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const owner = tabs.find((t) => t.sections.includes(hash));
      if (!owner) return;
      // The URL is an external system and this is the effect
      // synchronising with it, which is what effects are for. It cannot
      // move into a lazy useState initialiser: `window` does not exist
      // during SSR, so the server would render the default tab and the
      // client a different one — a hydration mismatch in place of one
      // extra render.
      setActive(owner.id);
      // The section is display:none until the tab switch paints, so the
      // browser's own jump-to-anchor has already failed by now. Scroll
      // it ourselves once React has shown it.
      const go = () =>
        document.getElementById(hash)?.scrollIntoView({ block: "start" });
      requestAnimationFrame(() => requestAnimationFrame(go));
    };

    apply();
    // Also on later hash changes, not just mount. A page with its own
    // table of contents links to its own sections, and without this a
    // reader on the wrong tab clicks one and nothing happens at all —
    // the browser updates the URL and the target is still hidden.
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [tabs]);

  // One rule per tab: inside the panel wrapper, hide every direct child
  // this tab does not own. Built from the same `sections` the deep-link
  // lookup uses, so the two cannot disagree.
  const css = tabs
    .map((t) => {
      const keep = t.sections.map((s) => `:not(#${s})`).join("");
      return `#${panelId}[data-tab="${t.id}"] > ${keep}{display:none}`;
    })
    .join("");

  return (
    <>
      <style>{css}</style>

      <div
        role="tablist"
        aria-label="Page sections"
        className="flex flex-wrap gap-1.5 text-xs"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              onClick={() => {
                setActive(t.id);
                // Drop a stale #section hash — it names a section this
                // tab may not show, and leaving it there means a reload
                // bounces the user back to the old tab.
                history.replaceState(null, "", window.location.pathname);
              }}
              className={`rounded-md px-3 py-1.5 font-medium ring-1 ring-inset transition-colors ${
                on
                  ? "bg-violet-500/20 text-violet-200 ring-violet-400/40"
                  : t.primary
                    ? "bg-violet-500/[0.06] text-violet-300/90 ring-violet-500/20 hover:bg-violet-500/15"
                    : "bg-white/[0.02] text-muted-foreground ring-white/10 hover:bg-white/[0.05] hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id={panelId} data-tab={active} className={panelClassName}>
        {children}
      </div>
    </>
  );
}
