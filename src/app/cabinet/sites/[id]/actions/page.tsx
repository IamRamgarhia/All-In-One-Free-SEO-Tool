import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  cabinetActions,
  cabinetAuditIssues,
  cabinetSites,
} from "@/db/cabinet/schema";
import { ActionsBoard } from "./actions-board";

export const dynamic = "force-dynamic";

export default async function CabinetActionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = requireCabinetDb();

  const [site] = await db
    .select()
    .from(cabinetSites)
    .where(eq(cabinetSites.id, id))
    .limit(1);
  if (!site) notFound();

  const actions = await db
    .select()
    .from(cabinetActions)
    .where(eq(cabinetActions.siteId, id))
    .orderBy(desc(cabinetActions.createdAt));

  const withIssues = await Promise.all(
    actions.map(async (a) => {
      let issueTitle: string | null = null;
      if (a.issueId) {
        const [issue] = await db
          .select({ title: cabinetAuditIssues.title, ruleId: cabinetAuditIssues.ruleId })
          .from(cabinetAuditIssues)
          .where(eq(cabinetAuditIssues.id, a.issueId))
          .limit(1);
        issueTitle = issue?.title ?? issue?.ruleId ?? null;
      }
      return {
        id: a.id,
        title: a.title,
        priority: a.priority,
        effort: a.effort,
        status: a.status,
        owner: a.owner,
        dueDate: a.dueDate,
        notes: a.notes,
        issueId: a.issueId,
        issueTitle,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/cabinet/sites/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {site.name ?? site.url}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Plan d&apos;action
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Priorités P0–P3, effort, statut, responsable — liés aux findings
          SEOmator.
        </p>
      </div>

      <ActionsBoard siteId={id} actions={withIssues} />
    </div>
  );
}
