import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";
import { generatePlanPdf } from "@/lib/plan-pdf";

/**
 * The 30-day plan as a branded PDF.
 *
 * The CSV beside this is for the person doing the work. This is the one
 * that gets sent: white-labelled, with the starting numbers on the cover
 * so next month's report has something to be measured against.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const clientId = Number.parseInt(id, 10);
  if (!Number.isInteger(clientId)) {
    return new Response("Not found", { status: 404 });
  }

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

  // The crawl, not the AI audit. Those share a table and use different
  // scales, and putting the wrong one on a document a client keeps is
  // how two numbers for one site end up in writing.
  const [audit] = await db
    .select({ score: audits.score, issuesCount: audits.issuesCount })
    .from(audits)
    .where(
      and(
        eq(audits.clientId, clientId),
        eq(audits.status, "completed"),
        eq(audits.kind, "crawler"),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);

  const pdf = await generatePlanPdf({
    clientName: client.name,
    clientUrl: client.url,
    tasks: rows,
    score: audit?.score ?? null,
    issueCount: audit?.issuesCount ?? null,
  });

  const safe = client.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${safe}-30-day-plan.pdf"`,
    },
  });
}
