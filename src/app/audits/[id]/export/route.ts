import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients } from "@/db/schema";
import {
  formatSeomatorAuditLlm,
  formatSeomatorAuditMarkdown,
} from "@/lib/seomator-export";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: idParam } = await params;
  const auditId = Number(idParam);
  if (!Number.isFinite(auditId)) notFound();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "markdown";
  if (format !== "markdown" && format !== "llm") {
    return new Response("format must be markdown or llm", { status: 400 });
  }

  const [row] = await db
    .select({
      kind: audits.kind,
      score: audits.score,
      pagesCrawled: audits.pagesCrawled,
      summary: audits.summary,
      rawReport: audits.rawReport,
      targetUrl: audits.targetUrl,
      clientId: audits.clientId,
    })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);

  if (!row || row.kind !== "seomator") notFound();

  const [client] = await db
    .select({ url: clients.url })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);

  const targetUrl = row.targetUrl ?? client?.url ?? "";

  const input = {
    url: targetUrl,
    score: row.score,
    pagesCrawled: row.pagesCrawled,
    summary: row.summary,
    rawReport: row.rawReport,
  };

  const body =
    format === "llm"
      ? formatSeomatorAuditLlm(input)
      : formatSeomatorAuditMarkdown(input);

  const ext = format === "llm" ? "llm.txt" : "md";
  const filename = `audit-${auditId}-seomator.${ext}`;

  return new Response(body, {
    headers: {
      "Content-Type": format === "llm" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
