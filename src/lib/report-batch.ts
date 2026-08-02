/**
 * Generate every client's report in one run, as drafts for review.
 *
 * The product's central claim, per CLAUDE.md, is that monthly reporting
 * goes from six hours to twenty-five minutes per agency. That was not
 * true at agency scale: reports were generated one client at a time,
 * from that client's own page, by a human clicking a button eighteen
 * times and waiting for each render.
 *
 * Two design decisions worth stating:
 *
 * **Drafts, not sends.** The batch produces reports; it does not deliver
 * them. A report generated and emailed unattended is a report nobody
 * read, and the first time an AI-written executive summary says
 * something wrong about a client's business, it says it to the client.
 * Twenty-five minutes of reviewing eighteen reports is the point — the
 * six hours being saved were spent *assembling* them, not reading them.
 *
 * **Progress in the database, not in memory.** A run takes minutes,
 * because the PDF renderer is behind a process-wide mutex and eighteen
 * clients means eighteen sequential renders. If progress lived in a
 * variable, closing the tab would lose it and reopening would show
 * nothing while work continued invisibly.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, reportArchives, reportBatches } from "@/db/schema";
import { generateReportPdf, type ReportTemplate } from "./report-generator";
import { logActivity } from "./activity";

export type BatchProgress = {
  id: number;
  status: "running" | "done" | "failed";
  total: number;
  done: number;
  failed: number;
  currentClientName: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

/**
 * Start a batch and return immediately with its id.
 *
 * Deliberately does NOT await the work. A server action that blocks for
 * four minutes hits every timeout between the browser and the process,
 * and the user gets a network error for a run that is actually fine.
 * The caller polls `getBatchProgress`.
 */
export async function startReportBatch(opts: {
  clientIds: number[];
  template?: ReportTemplate;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}): Promise<{ ok: true; batchId: number } | { ok: false; error: string }> {
  const ids = [...new Set(opts.clientIds)].filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { ok: false, error: "Pick at least one client." };

  // Refuse to start a second batch while one is running. Two concurrent
  // batches would queue behind the same render mutex and take twice as
  // long while both progress bars crawled — which reads as the app
  // having hung.
  const [running] = await db
    .select({ id: reportBatches.id })
    .from(reportBatches)
    .where(eq(reportBatches.status, "running"))
    .limit(1);
  if (running) {
    return {
      ok: false,
      error: "A batch is already running. Wait for it to finish.",
    };
  }

  const [batch] = await db
    .insert(reportBatches)
    .values({
      template: opts.template ?? "detailed",
      periodStart: opts.periodStart ?? null,
      periodEnd: opts.periodEnd ?? null,
      total: ids.length,
      startedAt: new Date(),
      status: "running",
    })
    .returning({ id: reportBatches.id });

  // Fire and forget. Errors are recorded on the batch row rather than
  // thrown into a promise nobody is holding.
  void runBatch(batch.id, ids, opts).catch(async (err) => {
    await db
      .update(reportBatches)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: (err as Error).message ?? String(err),
      })
      .where(eq(reportBatches.id, batch.id));
  });

  return { ok: true, batchId: batch.id };
}

async function runBatch(
  batchId: number,
  clientIds: number[],
  opts: {
    template?: ReportTemplate;
    periodStart?: Date | null;
    periodEnd?: Date | null;
  },
): Promise<void> {
  const template = opts.template ?? "detailed";
  let done = 0;
  let failed = 0;

  for (const clientId of clientIds) {
    await db
      .update(reportBatches)
      .set({ currentClientId: clientId })
      .where(eq(reportBatches.id, batchId));

    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    const name = client?.name ?? `Client ${clientId}`;

    try {
      const pdf = await generateReportPdf(clientId, template);
      await db.insert(reportArchives).values({
        clientId,
        title: reportTitle(name, opts.periodEnd ?? null),
        periodStart: opts.periodStart ?? null,
        periodEnd: opts.periodEnd ?? null,
        template,
        pdfBase64: pdf.toString("base64"),
        pdfBytes: pdf.byteLength,
        batchId,
        // The whole point of the batch: nothing is approved until a
        // person has looked at it.
        status: "draft",
      });
      done++;
    } catch (err) {
      // A failed client must not take the batch down with it — the other
      // seventeen reports are still worth having, and the user needs to
      // know WHICH one failed and why.
      failed++;
      await db.insert(reportArchives).values({
        clientId,
        title: reportTitle(name, opts.periodEnd ?? null),
        periodStart: opts.periodStart ?? null,
        periodEnd: opts.periodEnd ?? null,
        template,
        batchId,
        status: "failed",
        error: (err as Error).message ?? String(err),
      });
    }

    await db
      .update(reportBatches)
      .set({ done, failed })
      .where(eq(reportBatches.id, batchId));
  }

  await db
    .update(reportBatches)
    .set({
      status: "done",
      finishedAt: new Date(),
      currentClientId: null,
      done,
      failed,
    })
    .where(eq(reportBatches.id, batchId));

  await logActivity({
    kind: "report.generated",
    message:
      failed === 0
        ? `Generated ${done} report${done === 1 ? "" : "s"} — ready for review.`
        : `Generated ${done} report${done === 1 ? "" : "s"}, ${failed} failed.`,
    level: failed > 0 ? "warning" : "success",
    dedupe: false,
  });
}

function reportTitle(clientName: string, periodEnd: Date | null): string {
  const when = (periodEnd ?? new Date()).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return `${clientName} — ${when}`;
}

export async function getBatchProgress(
  batchId: number,
): Promise<BatchProgress | null> {
  const [b] = await db
    .select()
    .from(reportBatches)
    .where(eq(reportBatches.id, batchId))
    .limit(1);
  if (!b) return null;

  let currentClientName: string | null = null;
  if (b.currentClientId) {
    const [c] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(eq(clients.id, b.currentClientId))
      .limit(1);
    currentClientName = c?.name ?? null;
  }

  return {
    id: b.id,
    status: b.status,
    total: b.total,
    done: b.done,
    failed: b.failed,
    currentClientName,
    startedAt: b.startedAt.toISOString(),
    finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
    error: b.error,
  };
}

/** The most recent batch, so reopening the page picks up where it was. */
export async function latestBatch(): Promise<BatchProgress | null> {
  const [b] = await db
    .select({ id: reportBatches.id })
    .from(reportBatches)
    .orderBy(desc(reportBatches.startedAt))
    .limit(1);
  return b ? getBatchProgress(b.id) : null;
}

export type ReviewItem = {
  id: number;
  clientId: number;
  clientName: string;
  title: string;
  status: "draft" | "approved" | "sent" | "failed" | "rejected";
  pdfBytes: number | null;
  error: string | null;
  createdAt: string;
};

/**
 * Everything waiting to be looked at.
 *
 * Failed rows are included on purpose. A review queue that silently
 * omits the client whose report didn't generate is how someone sends
 * seventeen reports and finds out in a client meeting that the
 * eighteenth was never made.
 */
export async function reviewQueue(
  visibleClientIds: number[] | null,
): Promise<ReviewItem[]> {
  const scope =
    visibleClientIds === null
      ? undefined
      : inArray(reportArchives.clientId, visibleClientIds.length ? visibleClientIds : [-1]);

  const rows = await db
    .select({
      id: reportArchives.id,
      clientId: reportArchives.clientId,
      clientName: clients.name,
      title: reportArchives.title,
      status: reportArchives.status,
      pdfBytes: reportArchives.pdfBytes,
      error: reportArchives.error,
      createdAt: reportArchives.createdAt,
    })
    .from(reportArchives)
    .leftJoin(clients, eq(reportArchives.clientId, clients.id))
    .where(
      scope
        ? and(inArray(reportArchives.status, ["draft", "failed"]), scope)
        : inArray(reportArchives.status, ["draft", "failed"]),
    )
    .orderBy(desc(reportArchives.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName ?? "(deleted client)",
    title: r.title,
    status: r.status,
    pdfBytes: r.pdfBytes,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
  }));
}
