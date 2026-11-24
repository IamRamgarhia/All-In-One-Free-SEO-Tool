export const dynamic = "force-dynamic";

import { getLocale, getTranslations } from "next-intl/server";
import { issueFix, issueMessage, issueTypeName } from "@/lib/issue-display";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { db } from "@/db/client";
import { audits, auditIssues, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ChecklistView } from "./checklist-view";

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string; auditId: string }>;
}) {
  const tx = await getTranslations("ui.app_clients_id_ai-audit_auditId_page");
  const locale = await getLocale();
  const { id, auditId } = await params;
  const clientId = Number(id);
  const aId = Number(auditId);
  if (!Number.isFinite(clientId) || !Number.isFinite(aId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, aId), eq(audits.clientId, clientId)))
    .limit(1);
  if (!audit) notFound();

  const issues = await db
    .select()
    .from(auditIssues)
    .where(eq(auditIssues.auditId, aId))
    .orderBy(asc(auditIssues.id));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/clients/${clientId}/ai-audit`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        {tx("allAudits")}
      </Link>

      <PageHeader
        title={tx("audit", { name: client.name })}
        description={
          audit.targetUrl
            ? audit.targetUrl
            : "Single-page AI audit checklist"
        }
      />

      <ChecklistView
        audit={{
          id: audit.id,
          score: audit.score,
          issuesCount: audit.issuesCount,
          status: audit.status,
          summary: audit.summary,
          targetUrl: audit.targetUrl,
          createdAt: audit.createdAt,
        }}
        issues={issues.map((i) => ({
          id: i.id,
          type: i.type,
          severity: i.severity,
          message: issueMessage(i.type, i.message, locale),
          status: i.status,
          fixSteps: i.fixSteps ? issueFix(i.type, i.fixSteps, locale) : null,
          typeName: issueTypeName(i.type, locale),
          category: i.category,
          notes: i.notes,
        }))}
      />

      {audit.targetUrl && (
        <a
          href={audit.targetUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
        >
          {tx("openPageInNewTab")}
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
