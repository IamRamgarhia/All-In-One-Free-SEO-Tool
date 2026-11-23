import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { auditFacts, listMissions } from "@/lib/projects";
import { canCreateMission, pendingSuggestion, projectStage, suggestMission } from "@/lib/missions";
import { MissionsPanel } from "./missions-panel";

/**
 * The Missions tab of a project: where it stands (every project starts
 * with an audit), what the audit points to, and the missions agreed on
 * this site. Creating one happens in a sheet (missions-panel.tsx).
 */
export async function ProjectMissions({ projectId }: { projectId: number }) {
  const t = await getTranslations("clientPage.missions");
  const [facts, rows] = await Promise.all([auditFacts(projectId), listMissions(projectId)]);
  const stage = projectStage(facts);
  // No suggestion for a mission already under way: it would only be created twice.
  const suggestion = pendingSuggestion(suggestMission(facts), rows);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <ClipboardCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t(`stage_${stage}`)}</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{t(`stage_${stage}_hint`)}</p>
              {facts.score !== null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("facts", { score: facts.score, critical: facts.critical, high: facts.high })}
                </p>
              ) : null}
            </div>
          </div>
          {stage !== "audited" ? (
            <Link
              href={`/audits/c/${projectId}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("runAudit")}
              <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <MissionsPanel
        projectId={projectId}
        canCreate={canCreateMission(facts)}
        suggestion={suggestion}
        missions={rows.map((m) => ({
          id: m.id,
          kind: m.kind,
          title: m.title,
          status: m.status,
          targetStack: m.targetStack,
          notes: m.notes,
          startedAt: m.startedAt,
        }))}
      />
    </div>
  );
}
