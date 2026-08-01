/**
 * Run a real report batch against the real database and assert the
 * review workflow actually holds.
 *
 * The property that matters is not "did PDFs get made" — it is that
 * nothing can reach a client without a person having approved it. That
 * one is silent when broken: a batch that marks its output `approved`
 * instead of `draft` produces identical-looking reports and an empty
 * review queue, and the first sign of trouble is a client receiving
 * something nobody read.
 *
 *   pnpm exec tsx scripts/report-batch-check.ts
 *
 * Generates real PDFs into report_archives as drafts. It never sends
 * anything — sending requires an approved status and configured SMTP,
 * and this script approves nothing.
 */

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { clients, reportArchives, reportBatches } from "../src/db/schema";
import {
  getBatchProgress,
  reviewQueue,
  startReportBatch,
} from "../src/lib/report-batch";

let pass = 0;
let fail = 0;
const ok = (m: string, d = "") => {
  pass++;
  console.log(`  PASS  ${m}${d ? "  — " + d : ""}`);
};
const bad = (m: string, d = "") => {
  fail++;
  console.log(`  FAIL  ${m}${d ? "  — " + d : ""}`);
};
const section = (t: string) =>
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));

async function main() {
  const all = await db.select({ id: clients.id, name: clients.name }).from(clients);
  if (all.length === 0) {
    console.log("No clients — add one and re-run.");
    process.exit(0);
  }
  console.log(`Report batch check across ${all.length} client(s)\n`);

  section("Start — refuses an empty selection, allows a real one");
  const empty = await startReportBatch({ clientIds: [] });
  if (!empty.ok) ok("empty selection refused", empty.error);
  else bad("started a batch with no clients");

  const started = await startReportBatch({
    clientIds: all.map((c) => c.id),
    template: "detailed",
  });
  if (!started.ok) {
    bad("could not start a batch", started.error);
    process.exit(1);
  }
  ok("batch started", `id ${started.batchId}`);

  // A second batch while one is running would queue behind the same
  // render mutex and take twice as long with both bars crawling, which
  // reads as the app having hung.
  const second = await startReportBatch({ clientIds: all.map((c) => c.id) });
  if (!second.ok) ok("a second concurrent batch is refused", second.error);
  else bad("two batches started at once");

  section("Progress — must be readable while it runs, not just after");
  const deadline = Date.now() + 5 * 60_000;
  let progress = await getBatchProgress(started.batchId);
  let sawRunning = false;
  while (progress && progress.status === "running" && Date.now() < deadline) {
    sawRunning = true;
    process.stdout.write(
      `\r         ${progress.done + progress.failed}/${progress.total}` +
        (progress.currentClientName ? ` — ${progress.currentClientName}      ` : "      "),
    );
    await new Promise((r) => setTimeout(r, 1500));
    progress = await getBatchProgress(started.batchId);
  }
  process.stdout.write("\r" + " ".repeat(60) + "\r");

  if (sawRunning) ok("progress was observable mid-run");
  else ok("the run finished before the first poll", "small dataset");

  if (!progress) {
    bad("the batch row disappeared");
    process.exit(1);
  }
  if (progress.status === "done") ok("batch finished", `${progress.done} done, ${progress.failed} failed`);
  else bad(`batch ended as "${progress.status}"`, progress.error ?? "");

  if (progress.finishedAt) ok("finish time recorded");
  else bad("no finish time", "a crash would look like this");

  if (progress.done + progress.failed === progress.total) {
    ok("every selected client was accounted for", `${progress.total}`);
  } else {
    bad(
      "clients went missing from the batch",
      `${progress.done + progress.failed} of ${progress.total}`,
    );
  }

  section("Output — drafts, never pre-approved");
  const rows = await db
    .select()
    .from(reportArchives)
    .where(eq(reportArchives.batchId, started.batchId));

  if (rows.length === progress.total) {
    ok("one archive row per client", String(rows.length));
  } else {
    bad("archive rows don't match the batch", `${rows.length} vs ${progress.total}`);
  }

  // THE safety property. If a batch ever marks its output approved, the
  // review step is decoration and reports go out unread.
  const preApproved = rows.filter(
    (r) => r.status !== "draft" && r.status !== "failed",
  );
  if (preApproved.length === 0) {
    ok("nothing came out pre-approved", "every report needs a human");
  } else {
    bad(
      "A BATCH PRODUCED APPROVED REPORTS",
      `${preApproved.length} row(s) — these could be sent unread`,
    );
  }

  const succeeded = rows.filter((r) => r.status === "draft");
  const withoutPdf = succeeded.filter((r) => !r.pdfBase64 || !r.pdfBytes);
  if (withoutPdf.length === 0) {
    ok(`all ${succeeded.length} draft(s) carry a PDF`);
  } else {
    bad("drafts with no PDF attached", String(withoutPdf.length));
  }

  const sizes = succeeded
    .map((r) => r.pdfBytes ?? 0)
    .sort((a, b) => a - b);
  if (sizes.length && sizes[0] > 5_000) {
    ok("PDFs are a plausible size", `${(sizes[0] / 1024).toFixed(0)}-${(sizes[sizes.length - 1] / 1024).toFixed(0)} KB`);
  } else if (sizes.length) {
    bad("a PDF is suspiciously small", `${sizes[0]} bytes`);
  }

  const failures = rows.filter((r) => r.status === "failed");
  const silentFailures = failures.filter((r) => !r.error);
  if (silentFailures.length === 0) {
    ok(
      failures.length
        ? `all ${failures.length} failure(s) recorded a reason`
        : "no failures",
    );
  } else {
    bad("failures with no reason recorded", String(silentFailures.length));
  }

  section("Review queue — shows drafts AND failures");
  const queue = await reviewQueue(null);
  const queuedIds = new Set(queue.map((q) => q.id));
  const missing = rows.filter((r) => !queuedIds.has(r.id));
  if (missing.length === 0) {
    ok(`every row from this batch is in the queue`, String(rows.length));
  } else {
    bad(
      "rows produced by the batch are missing from the review queue",
      `${missing.length} — the user would never see these`,
    );
  }

  // A queue that omits the client whose report failed is how someone
  // sends seventeen reports and finds out in a meeting about the
  // eighteenth.
  if (failures.length === 0 || queue.some((q) => q.status === "failed")) {
    ok("failures are surfaced in the queue, not hidden");
  } else {
    bad("failed reports are missing from the review queue");
  }

  section("Scoping — a member only sees their own clients");
  const scopedEmpty = await reviewQueue([]);
  if (scopedEmpty.length === 0) {
    ok("a user assigned no clients sees an empty queue", "not everything");
  } else {
    bad(
      "AN UNASSIGNED USER SEES OTHER CLIENTS' REPORTS",
      `${scopedEmpty.length} row(s)`,
    );
  }

  const onlyFirst = await reviewQueue([all[0].id]);
  const leaked = onlyFirst.filter((q) => q.clientId !== all[0].id);
  if (leaked.length === 0) {
    ok("scoped queue contains only the permitted client");
  } else {
    bad("scoped queue leaked other clients", String(leaked.length));
  }

  console.log("\n" + "=".repeat(72));
  console.log(`${pass} passed, ${fail} failed`);

  // Clean up this run's rows so repeated invocations don't pile draft
  // reports into the user's real review queue.
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await db.delete(reportArchives).where(inArray(reportArchives.id, ids));
  }
  await db.delete(reportBatches).where(eq(reportBatches.id, started.batchId));
  console.log(`(cleaned up ${ids.length} test report row(s))`);

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nCRASHED:", e);
  // Best-effort cleanup so a crash doesn't leave a batch stuck
  // "running", which would block every future batch.
  const [stuck] = await db
    .select({ id: reportBatches.id })
    .from(reportBatches)
    .where(eq(reportBatches.status, "running"))
    .orderBy(desc(reportBatches.id))
    .limit(1);
  if (stuck) {
    await db
      .update(reportBatches)
      .set({ status: "failed", finishedAt: new Date(), error: "check script crashed" })
      .where(eq(reportBatches.id, stuck.id));
  }
  process.exit(1);
});
