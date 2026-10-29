"use client";

import { useEffect, useState } from "react";

export type SettingsTab = {
  /** Tab id, used in the URL as ?tab= and as the data attribute. */
  id: string;
  label: string;
  /** Section element ids this tab shows. Every section must appear in exactly one tab. */
  sections: readonly string[];
  /** Highlighted — the thing a new install needs first. */
  primary?: boolean;
};

/**
 * Settings, five tabs instead of one very long page.
 *
 * The page was ~760 lines of stacked cards and the jump-links above them
 * were the previous attempt at the same problem: a reader still had to
 * scroll past Google, Team, Email and Notifications to reach Privacy,
 * and nothing told them how much page was left. The five groups here are
 * the ones that nav already defined, so nobody has to relearn where
 * things live.
 *
 * It hides rather than unmounts. Every section stays server-rendered and
 * in the DOM exactly as before, and one generated stylesheet hides the
 * ones outside the active tab. That matters for two reasons: a form in a
 * hidden tab keeps whatever the user typed, and nothing had to be
 * reordered or re-parented to make this work — which on a file this size
 * is where the damage would have come from.
 *
 * Deep links keep working. There are ~20 `settings#ai`-style links
 * around the app; on mount the hash is matched to whichever tab owns
 * that section, that tab opens, and the browser is sent to it.
 * settings-tabs.test.ts fails the build if any of those links points at
 * a section that no tab owns, which is how two already-dead ones
 * (#smtp, #integrations) were found.
 */
export function SettingsTabs({
  tabs,
  children,
}: {
  tabs: readonly SettingsTab[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const owner = tabs.find((t) => t.sections.includes(hash));
    if (!owner || owner.id === tabs[0]?.id) return;
    // The URL is an external system and this is the effect synchronising
    // with it, which is what effects are for. It cannot move into a lazy
    // useState initialiser: `window` does not exist during SSR, so the
    // server would render the default tab and the client a different
    // one — a hydration mismatch in place of one extra render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(owner.id);
    // The section is display:none until the tab switch paints, so the
    // browser's own jump-to-anchor has already failed by now. Scroll it
    // ourselves once React has shown it.
    const go = () => document.getElementById(hash)?.scrollIntoView({ block: "start" });
    const raf = requestAnimationFrame(() => requestAnimationFrame(go));
    return () => cancelAnimationFrame(raf);
  }, [tabs]);

  // One rule per tab: inside the panel wrapper, hide every direct child
  // that this tab does not own. Built from the same `sections` the
  // deep-link lookup uses, so the two cannot disagree.
  const css = tabs
    .map((t) => {
      const keep = t.sections.map((s) => `:not(#${s})`).join("");
      return `#settings-panels[data-tab="${t.id}"] > ${keep}{display:none}`;
    })
    .join("");

  return (
    <>
      <style>{css}</style>

      <div
        role="tablist"
        aria-label="Settings sections"
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
              aria-controls="settings-panels"
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

      <div id="settings-panels" data-tab={active} className="space-y-5">
        {children}
      </div>
    </>
  );
}
