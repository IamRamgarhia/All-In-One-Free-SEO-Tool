import Link from "next/link";
import { badgeFor, capabilityOf, copyOf } from "@/lib/tool-capabilities";
import type { ConnectionMode } from "@/lib/tool-capabilities";
import { NAV_ITEMS } from "@/components/shell/nav-items";

/**
 * Shared pieces for the docs pages.
 *
 * Uses the same glass-card, accent-ring language as the rest of the app
 * rather than a separate docs theme — the sidebar and chrome come from
 * the root layout, so anything invented here would be the only thing on
 * screen that looked different.
 */

const TONE: Record<string, string> = {
  free: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25",
  chat: "bg-violet-500/10 text-violet-300 ring-violet-400/25",
  key: "bg-amber-500/10 text-amber-300 ring-amber-400/25",
};

/**
 * A readable name for any route.
 *
 * Tools carry their own title; everything else borrows the sidebar's
 * label, so the docs call a page what the navigation calls it. Without
 * this the "what this uses" list read "clients, audits, tasks" in raw
 * lowercase route form.
 */
export function routeLabel(href: string): string {
  const copy = copyOf(capabilityOf(href));
  if (copy) return copy.title;
  const nav = NAV_ITEMS.find((i) => i.href === href);
  if (nav) return nav.label;
  const last = href.split("/").filter(Boolean).pop() ?? href;
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

/**
 * The cost chip, from the same table the app uses.
 *
 * Outside /tools/* only the "free" state is shown. The capability data
 * over-approximates AI on composed pages — /audits comes back needing a
 * model purely because it embeds an add-client dialog — so on those
 * routes "needs AI" would be a guess dressed as a fact. Free cannot be
 * wrong, so free is all that gets said. Same rule as the sidebar.
 */
export function CostBadge({
  href,
  mode = "none",
}: {
  href: string;
  mode?: ConnectionMode;
}) {
  const cap = capabilityOf(href);
  const isTool = /^\/tools\/[^/]+$/.test(href);
  if (!isTool && cap?.needsAI !== false) return null;

  const badge = badgeFor(cap, mode);
  if (!badge) return null;
  return (
    <span
      title={badge.detail}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

/** Numbered steps. The number column is fixed so the text lines up. */
export function Steps({
  steps,
}: {
  steps: { do: string; then?: string }[];
}) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[11px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed">{s.do}</p>
            {s.then && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {s.then}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A short flagged aside. Rare on purpose, so it keeps being read. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[13px] leading-relaxed text-amber-100/90">
      {children}
    </p>
  );
}

/**
 * One tool in the reference list.
 *
 * The id makes every tool addressable — /docs#health-check — which is
 * what makes this linkable from an issue, a task, or a client email.
 */
export function ToolRow({ route }: { route: string }) {
  const cap = capabilityOf(route);
  const copy = copyOf(cap);
  const slug = route.replace("/tools/", "");
  if (!copy) return null;

  return (
    <li
      id={slug}
      className="scroll-mt-24 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition-colors hover:border-white/10"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link
          href={route}
          className="text-sm font-medium hover:text-violet-300 hover:underline"
        >
          {copy.title}
        </Link>
        <CostBadge href={route} />
        <a
          href={`#${slug}`}
          aria-label={`Link to ${copy.title}`}
          className="ml-auto text-xs text-muted-foreground/50 hover:text-foreground"
        >
          #
        </a>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {copy.description}
      </p>
    </li>
  );
}
