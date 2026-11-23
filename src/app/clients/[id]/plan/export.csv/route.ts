import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { guardClientRequest } from "@/lib/admin-auth";
import { clients, tasks } from "@/db/schema";
import { groupPlanByWeek } from "@/lib/plan-view";
import { getReportLocale } from "@/lib/report-i18n";

/**
 * The plan as a file, because "download it on the same page" is what
 * people actually asked for.
 *
 * CSV rather than PDF: this is a working schedule that gets pasted into
 * a spreadsheet, forwarded, and edited. A PDF of it would look more
 * finished and be less useful. The branded PDF report is a different
 * document with a different job.
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
    .select({ name: clients.name })
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

  const locale = (await getReportLocale()) === "fr" ? "fr" : "en";
  const plan = groupPlanByWeek(rows, locale);

  /** Excel treats a leading = or + as a formula, so those are defused. */
  const cell = (v: unknown): string => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const lines = [
    (locale === "fr"
      ? ["Semaine", "Échéance", "Tâche", "Pourquoi c’est important", "Minutes", "Statut"]
      : ["Week", "Due", "Task", "Why it matters", "Minutes", "Status"])
      .map(cell)
      .join(","),
  ];
  for (const w of plan.weeks) {
    for (const t of w.items) {
      lines.push(
        [
          w.label,
          t.dueLabel,
          t.title,
          t.whyItMatters ?? "",
          t.estimatedMinutes ?? "",
          locale === "fr" ? (STATUS_FR[t.status] ?? t.status) : t.status,
        ]
          .map(cell)
          .join(","),
      );
    }
  }

  const safe = client.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}-30-day-plan.csv"`,
    },
  });
}

const STATUS_FR: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  doing: "En cours",
  blocked: "Bloquée",
  done: "Faite",
  skipped: "Écartée",
};
