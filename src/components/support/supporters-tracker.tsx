"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import {
  type SupportTracker,
  type Supporter,
  formatRupees,
  goalPercent,
} from "@/lib/supporters";

const LATEST = 10;

/**
 * What has come in, what it is for, and who to thank.
 *
 * Rendered only when the tracker parsed — the caller passes `null` when the
 * file could not be read, and this returns nothing rather than a panel of
 * zeroes. "₹0 received" is a claim; "no panel" is not.
 */
export function SupportersTracker({
  tracker,
  source,
}: {
  tracker: SupportTracker | null;
  source: "network" | "cache" | "none";
}) {
  if (!tracker) return null;
  const { totalReceived, supporters, goal, thanks, people, updated } = tracker;

  const headline =
    totalReceived > 0
      ? `${formatRupees(totalReceived)} received so far${
          supporters ? ` from ${supporters} ${supporters === 1 ? "person" : "people"}` : ""
        }`
      : "Nobody has chipped in yet";

  return (
    <section
      aria-label="Supporters"
      className="space-y-3 rounded-2xl border border-white/[0.06] bg-card/40 p-5 text-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30">
          <Users className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{headline}</h2>
          <p className="text-xs text-muted-foreground">
            Every rupee goes into fixes and new features.
            {/* Provenance, per the project's second standing rule: a figure
                out of a local cache is a weaker claim than a fresh one. */}
            {updated ? ` Updated ${formatDay(updated)}.` : ""}
            {source === "cache" ? " Showing the last figures this install saw — it couldn't reach GitHub." : ""}
          </p>

          {goal && (
            <div className="mt-3.5 space-y-1.5">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Goal{goal.label ? `: ${goal.label}` : ""}
                </span>
                <span className="font-semibold">
                  {formatRupees(totalReceived)} of {formatRupees(goal.amount)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Progress towards the goal"
                aria-valuemin={0}
                aria-valuemax={goal.amount}
                aria-valuenow={Math.min(totalReceived, goal.amount)}
                className="h-2 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <div
                  className="h-full rounded-full bg-rose-400/80"
                  style={{ width: `${goalPercent(totalReceived, goal.amount)}%` }}
                />
              </div>
            </div>
          )}

          <ThanksList people={people} names={thanks} />
        </div>
      </div>
    </section>
  );
}

function formatDay(iso: string): string {
  // Midday, not midnight: a date-only string parsed as UTC midnight can
  // render as the previous day for anyone west of Greenwich.
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The names, newest first, with a search once the list outgrows a glance —
 * so anyone who chipped in can find their own name rather than scrolling
 * for it.
 */
function ThanksList({
  people,
  names,
}: {
  people: Supporter[];
  names: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // `people` carries amounts; `names` is what a supporters.json written
  // before that field existed has. Prefer the richer one, fall back to
  // the names rather than showing an empty panel.
  const rows = useMemo(
    () =>
      people.length
        ? people
        : names.map((name) => ({ name, amount: null, date: "" }) as const),
    [people, names],
  );

  // supporters.json appends, so the end of the array is the newest.
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const q = query.trim().toLowerCase();
  const found = useMemo(
    () => (q ? newestFirst.filter((r) => r.name.toLowerCase().includes(q)) : newestFirst),
    [newestFirst, q],
  );

  if (!rows.length) return null;
  const more = rows.length - LATEST;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-semibold">
        {open
          ? "Thank you, everyone"
          : `Thank you${rows.length > LATEST ? ` — the latest ${LATEST}` : ""}`}
      </p>

      {!open ? (
        <div className="flex flex-wrap gap-1.5">
          {newestFirst.slice(0, LATEST).map((r, i) => (
            <Chip key={`${r.name}-${i}`} amount={r.amount}>
              {r.name}
            </Chip>
          ))}
        </div>
      ) : (
        <>
          <label className="flex max-w-xs items-center gap-2 rounded-md bg-white/[0.04] px-2.5 ring-1 ring-inset ring-white/10">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a name"
              aria-label="Search supporters"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div
            role="list"
            aria-label="All supporters, newest first"
            className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1"
          >
            {found.map((r, i) => (
              <Chip key={`${r.name}-${i}`} amount={r.amount} asListItem>
                {r.name}
              </Chip>
            ))}
          </div>
          <p aria-live="polite" className="text-[11px] text-muted-foreground">
            {q
              ? found.length
                ? `${found.length} found`
                : `No supporter named “${query.trim()}” yet.`
              : `${rows.length} supporters, newest first.`}
          </p>
        </>
      )}

      {more > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            setQuery("");
          }}
          className="inline-flex h-7 items-center rounded-md bg-white/[0.04] px-2.5 text-[11px] text-foreground/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08]"
        >
          {open ? "Show the latest only" : `Show all ${rows.length} supporters`}
        </button>
      )}
    </div>
  );
}

function Chip({
  children,
  amount,
  asListItem,
}: {
  children: React.ReactNode;
  /** Rupees, when the file records them. `null` shows the name alone. */
  amount?: number | null;
  asListItem?: boolean;
}) {
  return (
    <span
      role={asListItem ? "listitem" : undefined}
      className="inline-flex items-baseline gap-1.5 rounded-full bg-rose-500/[0.08] px-2.5 py-1 text-[11px] text-foreground/90 ring-1 ring-inset ring-rose-500/20"
    >
      {children}
      {amount !== null && amount !== undefined && (
        <span className="font-semibold text-rose-300">
          {formatRupees(amount)}
        </span>
      )}
    </span>
  );
}
