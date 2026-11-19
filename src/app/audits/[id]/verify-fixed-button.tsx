"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { verifyIssueFixed } from "../issue-actions";

/**
 * "I've fixed this — check it."
 *
 * Sits beside "Mark resolved", and the difference between them is the
 * point. "Mark resolved" takes the user's word: on this install 155
 * findings were resolved that way, so the health score and every client
 * report rested on an unchecked claim. This one re-fetches the live page
 * and resolves only if the problem is actually gone.
 *
 * It is the only route to a *verified* fix for anyone without the
 * WordPress plugin — which, measured on this install, is every client.
 * The agent's own path is rigorous and unreachable; this is the same
 * rigour, reachable by everybody.
 *
 * Shows the answer inline rather than redirecting, because "still there,
 * probably a cache" is the most useful outcome and it must not look like
 * a failure of the button.
 */
export function VerifyFixedButton({
  issueId,
  auditId,
  /** Rendered small inside an issue card; larger on its own row. */
  compact = true,
}: {
  issueId: number;
  auditId: number;
  compact?: boolean;
}) {
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ result: string; note: string } | null>(
    null,
  );

  const run = () => {
    setBusy(true);
    setOutcome(null);
    start(async () => {
      try {
        const r = await verifyIssueFixed(issueId, auditId);
        setOutcome(r);
      } catch (err) {
        setOutcome({
          result: "unreachable",
          note: (err as Error).message || "The check could not run.",
        });
      } finally {
        setBusy(false);
      }
    });
  };

  if (outcome) {
    const good = outcome.result === "resolved";
    const Icon = good ? CheckCircle2 : XCircle;
    return (
      <span
        className={`inline-flex max-w-xl items-start gap-1.5 rounded-md px-2 py-1 text-[11px] leading-relaxed ring-1 ring-inset ${
          good
            ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30"
            : "bg-amber-500/10 text-amber-100 ring-amber-500/30"
        }`}
      >
        <Icon className="mt-0.5 size-3 shrink-0" />
        <span>
          {outcome.note}
          {!good && (
            <button
              type="button"
              onClick={run}
              className="ml-1.5 rounded underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              check again
            </button>
          )}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Re-fetches the page and only marks this resolved if the problem is genuinely gone"
      className={`inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 font-medium text-cyan-200 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-60 ${
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      }`}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <RefreshCw className="size-3" />
      )}
      {busy ? "Checking the live page…" : "I fixed this — check"}
    </button>
  );
}
