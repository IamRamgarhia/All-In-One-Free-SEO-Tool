import Link from "next/link";
import { AlertTriangle, PauseCircle } from "lucide-react";
import {
  readStoredHealth,
  type HealthIssue,
} from "@/lib/install-health";

/**
 * Says out loud, on the first screen, when this install is not working.
 *
 * The whole reason: on the maintainer's own machine the WordPress plugin
 * had been missing for 68 days, Search Console had been 403ing for as
 * long, 14 approved fixes had never been applied and 115 tasks had never
 * been completed. The app knew all four. It wrote them into agent run
 * summaries and a settings sub-page, and so nobody found out.
 *
 * Shown only for `broken` and `stalled`. `idle` — a client never audited
 * — is a thing you have not done yet, not a thing that is wrong, and
 * putting it here would make the banner routine. A banner that is always
 * on is a banner nobody reads, which puts us back where we started.
 */

const CAP = 4;

export async function InstallHealthBanner() {
  const health = await readStoredHealth().catch(() => null);
  // A banner that cannot read its own data says nothing rather than
  // claiming everything is fine.
  if (!health || health.neverChecked) return null;

  const actionable = health.issues.filter((i) => i.severity !== "idle");
  if (actionable.length === 0) return null;

  const worstIsBroken = actionable.some((i) => i.severity === "broken");
  const shown = actionable.slice(0, CAP);
  const hidden = actionable.length - shown.length;

  return (
    <section
      className={`rounded-xl border p-4 ${
        worstIsBroken
          ? "border-red-500/30 bg-red-500/[0.06]"
          : "border-amber-500/30 bg-amber-500/[0.06]"
      }`}
    >
      <div className="flex items-start gap-3">
        {worstIsBroken ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" />
        ) : (
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        )}
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <h2 className="text-sm font-medium">
              {worstIsBroken
                ? "Some of this install is not working"
                : "Work is being found but not finished"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {/* The timestamp matters: these checks run on a schedule,
                  not on this page load, and a banner that implies
                  otherwise would have people re-reading a stale
                  problem. */}
              Checked{" "}
              {health.checkedAt
                ? health.checkedAt.toLocaleString()
                : "at an unknown time"}
              .
            </p>
          </div>

          <ul className="space-y-2">
            {shown.map((i) => (
              <IssueRow key={i.id} issue={i} />
            ))}
          </ul>

          {hidden > 0 && (
            <p className="text-xs text-muted-foreground">
              and {hidden} more.{" "}
              <Link
                href="/settings/health"
                className="rounded text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                See all
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function IssueRow({ issue }: { issue: HealthIssue }) {
  return (
    <li className="min-w-0">
      <p className="text-xs font-medium">{issue.title}</p>
      {/* The evidence, verbatim. "rest_no_route" is what tells someone
          the plugin is not activated; a tidier paraphrase would lose the
          one detail that identifies the problem. */}
      <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
        {issue.evidence}
      </p>
      <Link
        href={issue.fixHref}
        className="mt-0.5 inline-block rounded text-[11px] font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {issue.fixLabel} →
      </Link>
    </li>
  );
}
