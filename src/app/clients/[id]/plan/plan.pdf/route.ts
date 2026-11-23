import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { guardClientRequest } from "@/lib/admin-auth";
import { audits, clients, tasks } from "@/db/schema";
import { generatePlanPdf } from "@/lib/plan-pdf";
import { getReportLocale } from "@/lib/report-i18n";
import { pickReferenceAudits } from "@/lib/reference-audit";

/**
 * The 30-day plan as a branded PDF.
 *
 * The CSV beside this is for the person doing the work. This is the one
 * that gets sent: white-labelled, with the starting numbers on the cover
 * so next month's report has something to be measured against.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const clientId = Number.parseInt(id, 10);
  if (!Number.isInteger(clientId)) {
    return new Response("Not found", { status: 404 });
  }
  // The layout guards the project's pages, not its route handlers.
  const forbidden = await guardClientRequest(req, clientId);
  if (forbidden) return forbidden;

  const [client] = await db
    .select({ name: clients.name, url: clients.url })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return new Response("Not found", { status: 404 });

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      whyItMatters: tasks.whyItMatters,
      status: tasks.status,
      dueDate: tasks.dueDate,
      estimatedMinutes: tasks.estimatedMinutes,
      sourceRef: tasks.sourceRef,
    })
    .from(tasks)
    .where(and(eq(tasks.clientId, clientId), eq(tasks.source, "auto_calendar")))
    .orderBy(asc(tasks.dueDate));

  if (rows.length === 0) {
    return new Response(
      "No plan for this client yet. Run smart onboarding first.",
      { status: 404 },
    );
  }

  // The reference crawl (lib/reference-audit.ts), not the AI audit: those
  // share a table and use different scales, and putting the wrong one on
  // a document a client keeps is how two numbers for one site end up in
  // writing. The full crawl first, as on every other page.
  const done = await db
    .select({ kind: audits.kind, mode: audits.mode, score: audits.score, issuesCount: audits.issuesCount })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));
  const audit = pickReferenceAudits(done).latest;
  const locale = (await getReportLocale()) === "fr" ? "fr" : "en";

  const pdf = await generatePlanPdf({
    clientName: client.name,
    clientUrl: client.url,
    tasks: rows,
    score: audit?.score ?? null,
    issueCount: audit?.issuesCount ?? null,
    locale,
  });

  const safe = client.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safe}-${locale === "fr" ? "plan-30-jours" : "30-day-plan"}.pdf"`,
    },
  });
}
