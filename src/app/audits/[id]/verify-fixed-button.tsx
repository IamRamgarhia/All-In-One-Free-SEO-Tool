"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { verifyIssuesFixed, type VerifyOutcome } from "../issue-actions";

/**
 * "I fixed this — check it." (ported from upstream 9702570)
 *
 * Sits before "Mark resolved", and the difference between them is the
 * point. "Mark resolved" takes the user's word; this re-fetches each
 * affected page and resolves the finding only where the problem is
 * actually gone — the only route to a verified fix without the
 * WordPress plugin.
 *
 * The answer is shown inline (and as a toast, because a finding fixed on
 * every page leaves the list when the page refreshes). "Still there,
 * probably a cache" is a useful answer and must not look like the button
 * failing.
 */
export function VerifyFixedButton({
  auditId,
  issueIds,
}: {
  auditId: number;
  issueIds: number[];
}) {
  const t = useTranslations("auditUi.verify");
  const [busy, start] = useTransition();
  const [outcome, setOutcome] = useState<VerifyOutcome | "error" | null>(null);

  const run = () => {
    setOutcome(null);
    start(async () => {
      try {
        const r = await verifyIssuesFixed(auditId, issueIds);
        setOutcome(r);
        const line = summary(r);
        if (r.ok && r.resolved > 0 && r.stillPresent.length === 0 && r.unverifiable === 0) toast.success(line);
        else toast.message(line);
      } catch {
        setOutcome("error");
        toast.error(t("failed"));
      }
    });
  };

  function summary(r: VerifyOutcome): string {
    if (!r.ok) return r.reason === "not_checkable" ? t("notCheckable") : t("gone");
    const parts: string[] = [];
    if (r.resolved > 0) parts.push(t("resolved", { count: r.resolved }));
    if (r.stillPresent.length > 0) parts.push(t("stillPresent", { count: r.stillPresent.length }));
    if (r.unverifiable > 0) parts.push(t("unverifiable", { count: r.unverifiable }));
    if (parts.length === 0) return t("nothingOpen");
    return t("summary", { parts: parts.join(t("sep")) });
  }

  if (outcome && !busy) {
    const good =
      outcome !== "error" &&
      outcome.ok &&
      outcome.stillPresent.length === 0 &&
      outcome.unverifiable === 0 &&
      outcome.remaining === 0;
    const Icon = good ? CheckCircle2 : XCircle;
    return (
      <div
        role="status"
        className={`flex w-full max-w-xl items-start gap-1.5 rounded-md px-2 py-1.5 text-[11px] leading-relaxed ring-1 ring-inset ${
          good
            ? "bg-emerald-500/10 text-emerald-200 ring-emerald-500/30"
            : "bg-amber-500/10 text-amber-100 ring-amber-500/30"
        }`}
      >
        <Icon className="mt-0.5 size-3 shrink-0" />
        <div className="min-w-0 space-y-1">
          <p>{outcome === "error" ? t("failed") : summary(outcome)}</p>
          {outcome !== "error" && outcome.ok ? (
            <>
              {outcome.stillPresent.length > 0 ? (
                <>
                  <p>{t("stillHint")}</p>
                  <ul className="space-y-0.5">
                    {outcome.stillPresent.slice(0, 5).map((u) => (
                      <li key={u} className="truncate opacity-80">
                        {u}
                      </li>
                    ))}
                    {outcome.stillPresent.length > 5 ? (
                      <li className="opacity-80">{t("andMore", { count: outcome.stillPresent.length - 5 })}</li>
                    ) : null}
                  </ul>
                </>
              ) : null}
              {outcome.unverifiable > 0 ? <p>{t("unverifiableHint")}</p> : null}
              {outcome.remaining > 0 ? <p>{t("remaining", { count: outcome.remaining })}</p> : null}
              {outcome.tasksClosed > 0 ? <p>{t("tasksClosed", { count: outcome.tasksClosed })}</p> : null}
            </>
          ) : null}
          {good ? null : (
            <button
              type="button"
              onClick={run}
              className="rounded underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {t("again")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title={t("title")}
      className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 px-2 py-1 font-medium text-cyan-200 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
      {busy ? t("checking", { count: Math.min(issueIds.length, 25) }) : t("button")}
    </button>
  );
}
