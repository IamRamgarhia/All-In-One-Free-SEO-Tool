import { eq, and, lte, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, reportSchedules } from "@/db/schema";
import { generateReportPdf, type ReportTemplate } from "./report-generator";
import { sendMail } from "./mailer";
import { getSetting } from "./settings-store";
import { logActivity } from "./activity";

/**
 * Compute the next time this schedule should fire. We store it on the row
 * so the runner can do a fast `nextSendAt <= now` query.
 */
export function computeNextSendAt(
  schedule: {
    frequency: "weekly" | "monthly";
    dayOfMonth: number | null;
    dayOfWeek: number | null;
    hourOfDay: number;
  },
  from: Date = new Date(),
): Date {
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(schedule.hourOfDay);

  if (schedule.frequency === "monthly") {
    const day = Math.min(schedule.dayOfMonth ?? 1, 28);
    next.setDate(day);
    if (next <= from) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(day);
    }
  } else {
    // weekly
    const targetDow = schedule.dayOfWeek ?? 1;
    const currentDow = next.getDay();
    let daysAhead = (targetDow - currentDow + 7) % 7;
    if (daysAhead === 0 && next <= from) daysAhead = 7;
    next.setDate(next.getDate() + daysAhead);
  }
  return next;
}

/**
 * Run all due schedules. Called from a request-time runner on the dashboard
 * (so the user doesn't need OS cron). We track the last run timestamp in
 * settings to avoid hammering Google APIs every page load.
 */
const RUNNER_INTERVAL_MS = 5 * 60 * 1000; // 5 min

export async function tickScheduleRunner(): Promise<void> {
  const lastRun = await getSetting<number>(
    "schedule_runner.last_run",
  ).catch(() => null);
  if (
    typeof lastRun === "number" &&
    Date.now() - lastRun < RUNNER_INTERVAL_MS
  ) {
    return;
  }

  // Set the timestamp BEFORE running so concurrent requests don't both fire
  const { setSetting } = await import("./settings-store");
  await setSetting("schedule_runner.last_run", Date.now());

  await runDueSchedules();
}

export async function runDueSchedules(): Promise<{
  fired: number;
  errors: string[];
}> {
  const now = new Date();
  const due = await db
    .select()
    .from(reportSchedules)
    .where(
      and(
        eq(reportSchedules.enabled, true),
        isNotNull(reportSchedules.nextSendAt),
        lte(reportSchedules.nextSendAt, now),
      ),
    );

  let fired = 0;
  const errors: string[] = [];

  for (const s of due) {
    try {
      await fireSchedule(s.id);
      fired += 1;
    } catch (err) {
      errors.push(`schedule ${s.id}: ${(err as Error).message}`);
    }
  }
  return { fired, errors };
}

export async function fireSchedule(scheduleId: number): Promise<void> {
  const [s] = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.id, scheduleId))
    .limit(1);
  if (!s) throw new Error("Schedule not found");

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, s.clientId))
    .limit(1);
  if (!client) throw new Error("Client not found");

  const result = await sendReportEmail({
    clientId: s.clientId,
    template: s.template,
    recipients: s.recipients,
  });

  if (!result.ok) {
    await logActivity({
      kind: "report.generated",
      message: `Failed to email report for ${client.name}: ${result.error}`,
      level: "error",
      clientId: client.id,
    });
    return;
  }

  // Advance nextSendAt
  const next = computeNextSendAt({
    frequency: s.frequency,
    dayOfMonth: s.dayOfMonth,
    dayOfWeek: s.dayOfWeek,
    hourOfDay: s.hourOfDay,
  });
  await db
    .update(reportSchedules)
    .set({
      lastSentAt: new Date(),
      nextSendAt: next,
      updatedAt: new Date(),
    })
    .where(eq(reportSchedules.id, scheduleId));

  await logActivity({
    kind: "report.generated",
    message: `Emailed ${s.template} report for ${client.name} to ${s.recipients.length} recipient${s.recipients.length === 1 ? "" : "s"}.`,
    level: "success",
    clientId: client.id,
  });
}

/**
 * Generate + email a report on demand. Reused by both the runner and the
 * "Send now" button. Returns ok+messageId or ok=false+error.
 */
export async function sendReportEmail(opts: {
  clientId: number;
  template: ReportTemplate;
  recipients: string[];
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  if (opts.recipients.length === 0) {
    return { ok: false, error: "No recipients" };
  }
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  let pdf: Buffer;
  try {
    pdf = await generateReportPdf(opts.clientId, opts.template);
  } catch (err) {
    return { ok: false, error: `PDF generation failed: ${(err as Error).message}` };
  }

  const periodLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const subject = `${client.name} — SEO Report (${periodLabel})`;
  const text = [
    `Hi,`,
    ``,
    `Attached is your SEO report for ${client.name} (${periodLabel}).`,
    ``,
    `Highlights inside:`,
    `· Health score with WoW delta`,
    `· Top organic keywords from Search Console`,
    `· Quick-win opportunities (positions 4-15)`,
    `· Tasks completed and recommendations for next month`,
    ``,
    `Reply to this email if anything's unclear.`,
  ].join("\n");

  const result = await sendMail({
    to: opts.recipients,
    subject,
    text,
    attachments: [
      {
        filename: `${slugify(client.name)}-seo-report-${periodLabel.toLowerCase().replace(/\s/g, "-")}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  return result;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
