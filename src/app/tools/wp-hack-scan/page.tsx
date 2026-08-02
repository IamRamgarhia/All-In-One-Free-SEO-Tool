"use client";

import { useActionState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Loader2, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runWpHackScan, type WpHackState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const SEVERITY_TONE = {
  critical: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  low: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
};

const RISK_LEVEL_TONE = {
  clean: "border-emerald-500/30 bg-emerald-500/5",
  suspicious: "border-amber-500/30 bg-amber-500/5",
  compromised: "border-rose-500/30 bg-rose-500/5",
  critical: "border-rose-500/30 bg-rose-500/10",
};

const RISK_LEVEL_TEXT = {
  clean: "text-emerald-300",
  suspicious: "text-amber-300",
  compromised: "text-rose-300",
  critical: "text-rose-300",
};

export default function WpHackScanPage() {
  const [state, formAction, pending] = useActionState<WpHackState, FormData>(
    runWpHackScan,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="WordPress hack / malware scan"
        description="Probes a live WordPress site from the outside for active compromise indicators: backdoor files, exposed configs, JS injection, hidden iframes, spam injection, cloaking, version disclosure. Returns a containment + cleanup + prevention playbook."
        icon={ShieldAlert}
        accent="rose"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">WordPress site URL</span>
          <input
            name="url"
            required
            placeholder="https://yoursite.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Probing… (30-60s — runs 50+ HTTP checks)
            </>
          ) : (
            <>
              <ShieldAlert className="mr-2 size-4" />
              Scan for hack indicators
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Remote-only scan via HTTP probes — we can&apos;t read PHP files
          on your server. For deep file inspection install Wordfence or
          Sucuri on the WordPress side. This catches what&apos;s visible
          externally (which is usually how Google notices first).
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section
            className={`rounded-2xl border p-6 ${RISK_LEVEL_TONE[state.report.riskLevel]}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-base font-semibold">
                  {state.report.domain}
                </h2>
                <p
                  className={`text-xs font-medium uppercase tracking-wider ${RISK_LEVEL_TEXT[state.report.riskLevel]}`}
                >
                  Risk level: {state.report.riskLevel}
                </p>
              </div>
              <div className="text-right">
                <div
                  className={`text-3xl font-bold tabular-nums ${RISK_LEVEL_TEXT[state.report.riskLevel]}`}
                >
                  {state.report.iocs.length}
                </div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Indicators of compromise
                </p>
              </div>
            </div>
            {state.report.cloudflareQuickFix && (
              <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <p className="font-semibold text-amber-200">
                  ⚡ Quick fix: enable Cloudflare &quot;Under Attack Mode&quot;
                </p>
                <p className="mt-1">
                  If you have Cloudflare on this domain, turn on Under Attack
                  Mode (Security → Settings) right now — it interposes a JS
                  challenge that blocks most automated exploit traffic while
                  you clean up.{" "}
                  <a
                    href="https://developers.cloudflare.com/waf/tools/under-attack-mode/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-300 underline"
                  >
                    Cloudflare docs
                  </a>
                </p>
              </div>
            )}
          </section>

          {state.report.iocs.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  Indicators of compromise ({state.report.iocs.length})
                </h3>
              </header>
              <ul className="divide-y divide-white/[0.06]">
                {state.report.iocs.map((ioc) => (
                  <li
                    key={ioc.id}
                    className="space-y-2 px-5 py-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${SEVERITY_TONE[ioc.severity]}`}
                      >
                        {ioc.severity}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {ioc.category}
                      </span>
                      <strong className="font-medium">{ioc.title}</strong>
                    </div>
                    <p className="text-xs text-muted-foreground">{ioc.detail}</p>
                    {ioc.evidence && (
                      <pre className="overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px]">
                        {ioc.evidence}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.report.containmentSteps.length > 0 && (
            <Section title="🚨 Containment (do these NOW)" tone="rose">
              {state.report.containmentSteps}
            </Section>
          )}
          {state.report.cleanupSteps.length > 0 && (
            <Section title="🧹 Cleanup (after containment)" tone="amber">
              {state.report.cleanupSteps}
            </Section>
          )}
          <Section title="🛡 Prevention (build the wall back up)" tone="emerald">
            {state.report.preventionSteps}
          </Section>
        </>
      )}

      <RecentRuns toolId="wp-hack-scan" refreshKey={refreshKey} />
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "rose" | "amber" | "emerald";
  children: string[];
}) {
  const ring = {
    rose: "border-rose-500/20 bg-rose-500/[0.04]",
    amber: "border-amber-500/20 bg-amber-500/[0.04]",
    emerald: "border-emerald-500/20 bg-emerald-500/[0.04]",
  }[tone];
  return (
    <section className={`rounded-2xl border p-5 ${ring}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ol className="mt-2 space-y-1.5 text-sm">
        {children.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {String(i + 1).padStart(2, "0")}.
            </span>
            <span className="whitespace-pre-wrap">{step.replace(/^\d+\.\s*/, "")}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
