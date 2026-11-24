import Link from "next/link";
import { AlertTriangle, PauseCircle } from "lucide-react";
import { readStoredHealth } from "@/lib/install-health";
import { getHealthText, IssueRow } from "./install-health-row";

/**
 * Says out loud, on the first screen, when this install is not working.
 *
 * Ported from upstream: on the maintainer's own machine a WordPress
 * plugin had been missing for weeks, Search Console had been refusing
 * for as long, and approved fixes had never been applied. The app knew
 * all of it and wrote it into run summaries and a settings sub-page, so
 * nobody found out.
 *
 * Shown only for `broken` and `stalled`. `idle` — a project never
 * audited — is a thing not done yet, not a thing that is wrong, and
 * putting it here would make the banner routine. A banner that is always
 * on is a banner nobody reads. Renders nothing when nothing is wrong,
 * and nothing before the first check has run (Settings → System health
 * says so instead of implying an all-clear).
 */

const CAP = 4;

export async function InstallHealthBanner() {
  const health = await readStoredHealth().catch(() => null);
  // A banner that cannot read its own data says nothing rather than
  // claiming everything is fine.
  if (!health || health.neverChecked) return null;

  const actionable = health.issues.filter((i) => i.severity !== "idle");
  if (actionable.length === 0) return null;

  const { t, text, formatCheckedAt } = await getHealthText();
  const worstIsBroken = actionable.some((i) => i.severity === "broken");
  const shown = actionable.slice(0, CAP);
  const hidden = actionable.length - shown.length;

  return (
    <section
      aria-labelledby="install-health-title"
      className={`rounded-lg border p-4 sm:p-5 ${
        worstIsBroken
          ? "border-red-500/30 bg-red-500/[0.06]"
          : "border-amber-500/30 bg-amber-500/[0.06]"
      }`}
    >
      <div className="flex items-start gap-3">
        {worstIsBroken ? (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
        ) : (
          <PauseCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="install-health-title" className="text-sm font-semibold">
              {worstIsBroken ? t("banner.titleBroken") : t("banner.titleStalled")}
            </h2>
            {/* The timestamp matters: these checks run on a schedule, not
                on this page load, and a banner that implied otherwise
                would have people re-reading a stale problem. */}
            {health.checkedAt && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("banner.checkedAt", { date: formatCheckedAt(health.checkedAt) })}
              </p>
            )}
          </div>

          <ul className="space-y-3">
            {shown.map((i) => (
              <IssueRow key={i.id} issue={i} text={text(i)} />
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            {hidden > 0 && <>{t("banner.more", { count: hidden })} </>}
            <Link
              href="/settings/health"
              className="inline-flex min-h-8 items-center font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              {t("banner.seeAll")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
