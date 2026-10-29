"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { dismissSupportNudge } from "@/app/about/actions";
import {
  type SupportTracker,
  formatRupees,
  goalPercent,
} from "@/lib/supporters";

/**
 * The support card on the maintainer's own dashboard.
 *
 * Rules it keeps, which are the whole reason it is allowed to exist:
 *
 *   - It never appears until the install has actually done something (the
 *     caller checks `shouldShowSupportNudge`), so a fresh install is not
 *     asked for money before it has earned any goodwill.
 *   - It is a card in the page flow. Never a popup, never a layout shift
 *     onto something being read, never blocking work.
 *   - It is on the dashboard only. Not the client portal, not a PDF report,
 *     not an invoice — this tool gets used in front of paying clients, and
 *     the maintainer's tip jar is not their business.
 *   - Every dismissal is honoured exactly as labelled.
 *
 * `auditsRun` is shown back because it is the honest reason the card is
 * here: the tool did that work for them.
 */
export function SupportNudge({
  auditsRun,
  line,
  tracker,
}: {
  auditsRun: number;
  line: string;
  tracker: SupportTracker | null;
}) {
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (gone) return null;

  const put = (mode: "today" | "snooze" | "never") => {
    // Hide at once, then persist. The card going away is the whole point of
    // pressing the button, and it should not wait on a database write.
    setGone(true);
    startTransition(() => {
      void dismissSupportNudge(mode);
    });
  };

  const goal = tracker?.goal;
  const total = tracker?.totalReceived ?? 0;

  return (
    <section
      role="note"
      aria-label="Support this project"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-card/40 p-4 text-sm"
    >
      <Heart className="size-5 shrink-0 text-rose-400" aria-hidden />

      <div className="min-w-0 flex-1 basis-72">
        <p className="font-semibold">
          {auditsRun.toLocaleString()} audits run with this tool
        </p>
        <p className="text-xs text-muted-foreground">{line}</p>

        {tracker && total > 0 && (
          <div className="mt-1.5 text-xs">
            {goal ? (
              <>
                {formatRupees(total)} of {formatRupees(goal.amount)} raised
                {goal.label ? ` for ${goal.label}` : ""}
                <div
                  role="progressbar"
                  aria-label="Progress towards the goal"
                  aria-valuemin={0}
                  aria-valuemax={goal.amount}
                  aria-valuenow={Math.min(total, goal.amount)}
                  className="mt-1 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/[0.06]"
                >
                  <div
                    className="h-full rounded-full bg-rose-400/80"
                    style={{ width: `${goalPercent(total, goal.amount)}%` }}
                  />
                </div>
              </>
            ) : (
              <>{formatRupees(total)} received so far</>
            )}
          </div>
        )}
      </div>

      <Link
        href="/about#support"
        onClick={() => put("today")}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-rose-500/15 px-3 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 transition-colors hover:bg-rose-500/25"
      >
        <Heart className="size-3.5" />
        Support this project
      </Link>

      <button
        type="button"
        disabled={pending}
        onClick={() => put("today")}
        className="inline-flex h-8 items-center rounded-md bg-white/[0.04] px-3 text-xs text-foreground/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08] disabled:opacity-60"
      >
        Not today
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => put("snooze")}
        className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-60"
      >
        Hide for 30 days
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={() => put("never")}
        className="text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-60"
      >
        Never ask again
      </button>
    </section>
  );
}
