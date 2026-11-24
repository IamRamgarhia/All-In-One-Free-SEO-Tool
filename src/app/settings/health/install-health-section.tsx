import { CheckCircle2, Clock } from "lucide-react";
import { readStoredHealth } from "@/lib/install-health";
import { getHealthText, IssueRow } from "@/app/install-health-row";

/**
 * The full install-health list, including the `idle` items the dashboard
 * banner leaves out.
 *
 * Reads the same stored result the banner reads. Two surfaces computing
 * their own answer is how they end up disagreeing about whether the
 * install is fine.
 */
export async function InstallHealthSection() {
  const health = await readStoredHealth().catch(() => null);
  const { t, text, formatCheckedAt } = await getHealthText();

  if (!health || health.neverChecked) {
    // Deliberately not an all-clear. "We have not looked" and "nothing
    // is wrong" rendering the same is the bug this whole feature
    // replaces.
    return (
      <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("section.neverTitle")}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("section.neverBody")}</p>
          </div>
        </div>
      </section>
    );
  }

  const actionable = health.issues.filter((i) => i.severity !== "idle");
  const idle = health.issues.filter((i) => i.severity === "idle");

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{t("section.title")}</h2>
        {health.checkedAt && (
          <span className="text-xs text-muted-foreground">
            {t("section.checkedAt", { date: formatCheckedAt(health.checkedAt) })}
          </span>
        )}
      </div>

      {actionable.length === 0 && idle.length === 0 && (
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("section.allClear")}</p>
        </div>
      )}

      {actionable.length > 0 && (
        <ul className="space-y-3">
          {actionable.map((i) => (
            <IssueRow key={i.id} issue={i} text={text(i)} withIcon />
          ))}
        </ul>
      )}

      {idle.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("section.idleTitle")}</p>
          <ul className="mt-2 space-y-3">
            {idle.map((i) => (
              <IssueRow key={i.id} issue={i} text={text(i)} withIcon />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
