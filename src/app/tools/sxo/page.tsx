"use client";

import { useActionState, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runSxoAudit, type SxoState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { FindingsChecklist } from "@/components/findings-checklist";

export default function SxoPage() {
  const [state, formAction, pending] = useActionState<SxoState, FormData>(
    runSxoAudit,
    null,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setRefreshKey((k) => k + 1);
  }, [state]);

  // Auto-fill the URL when the tool is opened from a client context.
  // The "Tools for this client" launcher links here with ?url=... so
  // the user doesn't have to retype the domain.
  const params = useSearchParams();
  const presetUrl = params?.get("url") ?? "";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="SXO — Search Experience Optimization"
        description="Audits ranking pages on the user-experience signals Google now weights heavily: page promise, time-to-answer, next step, friction, Core Web Vitals. Blends SEO with UX."
        icon={Eye}
        accent="cyan"
      />

      <form
        action={formAction}
        className="rounded-xl border border-border bg-card p-5 shadow"
      >
        <label className="block space-y-1.5 text-sm">
          <span className="text-muted-foreground">URL to audit</span>
          {/* Input + button on one row, button visually attached to the right */}
          <div className="flex w-full overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-cyan-500/40">
            <input
              name="url"
              required
              defaultValue={presetUrl}
              placeholder="https://yoursite.com/page"
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 border-l border-input bg-cyan-500/15 px-4 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Auditing…
                </>
              ) : (
                <>
                  <Eye className="size-4" />
                  Run SXO audit
                </>
              )}
            </button>
          </div>
        </label>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section
            className={`rounded-2xl border p-6 ${
              state.audit.sxoScore >= 75
                ? "border-emerald-500/30 bg-emerald-500/5"
                : state.audit.sxoScore >= 50
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">{state.audit.url}</h2>
                <p className="text-xs text-muted-foreground">
                  Intent: <strong>{state.audit.intent}</strong> · Primary persona:{" "}
                  <strong>{state.audit.primaryPersona}</strong>
                </p>
              </div>
              <div
                className={`text-4xl font-bold tabular-nums ${
                  state.audit.sxoScore >= 75
                    ? "text-emerald-300"
                    : state.audit.sxoScore >= 50
                      ? "text-amber-300"
                      : "text-rose-300"
                }`}
              >
                {state.audit.sxoScore}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <Card title="Page promise" ok={state.audit.pagePromise.ok}>
              {state.audit.pagePromise.note}
            </Card>
            <Card title="Time-to-answer" score={state.audit.timeToAnswer.score}>
              {state.audit.timeToAnswer.note}
            </Card>
            <Card title="Next step" ok={state.audit.nextStep.ok}>
              {state.audit.nextStep.note}
            </Card>
            <Card title="Friction" score={state.audit.friction.score}>
              {state.audit.friction.items.length === 0 ? (
                "No friction items detected."
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {state.audit.friction.items.map((f, i) => (
                    <li key={i} className="text-rose-300">
                      · {f}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Core Web Vitals (lab)" score={state.audit.cwv.score}>
              LCP {state.audit.cwv.lcpMs ?? "?"}ms · CLS{" "}
              {state.audit.cwv.cls?.toFixed(3) ?? "?"}
            </Card>
          </section>

          {/* Per-finding checklist with mark-complete + re-check.
              Backed by the tool_findings table; persists status across
              page reloads. The runs list re-renders when the user
              completes everything and clicks Re-check. */}
          {state.audit.findings && state.audit.findings.length > 0 ? (
            <FindingsChecklist
              findings={state.audit.findings}
              subjectLabel={state.audit.url.replace(/^https?:\/\//, "")}
              onRecheck={() => {
                // Re-submit the same form so the audit re-runs with the
                // same URL. The action will produce a new run_id and
                // fresh findings; the user can compare scores.
                const fd = new FormData();
                fd.append("url", state.audit.url);
                return new Promise<void>((resolve) => {
                  formAction(fd);
                  // Resolve quickly — the page will re-render with new
                  // state when the action returns.
                  setTimeout(resolve, 100);
                });
              }}
            />
          ) : (
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Recommended fixes</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {state.audit.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <AiDisclaimer variant="inline" />
              </div>
            </section>
          )}
        </>
      )}

      <RecentRuns toolId="sxo" refreshKey={refreshKey} />
    </div>
  );
}

function Card({
  title,
  ok,
  score,
  children,
}: {
  title: string;
  ok?: boolean;
  score?: number;
  children: React.ReactNode;
}) {
  const tone =
    score !== undefined
      ? score >= 75
        ? "emerald"
        : score >= 50
          ? "amber"
          : "rose"
      : ok
        ? "emerald"
        : "rose";
  const ring = {
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
    amber: "border-amber-500/20 bg-amber-500/[0.04]",
    rose: "border-rose-500/20 bg-rose-500/[0.04]",
  }[tone];
  const txt = {
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${ring}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <span className={`text-lg font-semibold ${txt}`}>
          {score !== undefined ? `${score}/100` : ok ? "✓ Pass" : "✗ Fix"}
        </span>
      </div>
      <div className="mt-1.5 text-xs">{children}</div>
    </div>
  );
}
