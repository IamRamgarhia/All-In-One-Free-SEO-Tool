import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from "lucide-react";
import { readStoredHealth, type HealthIssue } from "@/lib/install-health";

/**
 * The full install-health list, including the `idle` items the dashboard
 * banner leaves out.
 *
 * Reads the same stored result the banner reads. Two surfaces computing
 * their own answer is how they end up disagreeing about whether the
 * install is fine — the fourth standing rule, applied to a judgement
 * rather than a list of names.
 */
export async function InstallHealthSection() {
  const health = await readStoredHealth().catch(() => null);

  if (!health || health.neverChecked) {
    // Deliberately not an all-clear. "We have not looked" and "nothing
    // is wrong" rendering the same is the bug this whole feature
    // replaces.
    return (
      <section className="rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">Install checks have not run yet</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              They run every six hours and ping each client&apos;s WordPress
              site, so they do not run while you load this page. Nothing here
              means nothing has been checked — not that everything is fine.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const actionable = health.issues.filter((i) => i.severity !== "idle");
  const idle = health.issues.filter((i) => i.severity === "idle");

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Is this install working?</h2>
        <span className="text-[11px] text-muted-foreground">
          Checked{" "}
          {health.checkedAt ? health.checkedAt.toLocaleString() : "unknown"}
        </span>
      </div>

      {actionable.length === 0 && idle.length === 0 && (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          <p className="text-xs text-muted-foreground">
            Every connection answered, and work is being completed.
          </p>
        </div>
      )}

      {actionable.length > 0 && (
        <ul className="space-y-2.5">
          {actionable.map((i) => (
            <Row key={i.id} issue={i} />
          ))}
        </ul>
      )}

      {idle.length > 0 && (
        <div className="border-t border-border pt-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Not set up yet — not faults
          </p>
          <ul className="mt-1.5 space-y-2">
            {idle.map((i) => (
              <Row key={i.id} issue={i} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Row({ issue }: { issue: HealthIssue }) {
  const Icon =
    issue.severity === "broken"
      ? AlertTriangle
      : issue.severity === "stalled"
        ? PauseCircle
        : Clock;
  const tone =
    issue.severity === "broken"
      ? "text-red-400"
      : issue.severity === "stalled"
        ? "text-amber-400"
        : "text-muted-foreground";

  return (
    <li className="flex min-w-0 items-start gap-2">
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{issue.title}</p>
        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
          {issue.evidence}
        </p>
        <Link
          href={issue.fixHref}
          className="mt-0.5 inline-block rounded text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {issue.fixLabel} →
        </Link>
      </div>
    </li>
  );
}
