"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { reportSchedules } from "@/db/schema";
import {
  computeNextSendAt,
  sendReportEmail,
} from "@/lib/report-mailer";
import { getSmtpConfig } from "@/lib/mailer";

const scheduleInput = z.object({
  clientId: z.coerce.number().int().positive(),
  template: z.enum(["executive", "detailed", "technical"]).default("detailed"),
  frequency: z.enum(["weekly", "monthly"]).default("monthly"),
  dayOfMonth: z.coerce.number().int().min(1).max(28).default(1),
  dayOfWeek: z.coerce.number().int().min(0).max(6).default(1),
  hourOfDay: z.coerce.number().int().min(0).max(23).default(9),
  recipients: z.string().trim().min(1, "Add at least one recipient"),
});

export type SaveScheduleResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

export async function saveSchedule(
  _prev: SaveScheduleResult | null,
  formData: FormData,
): Promise<SaveScheduleResult> {
  const parsed = scheduleInput.safeParse({
    clientId: formData.get("clientId"),
    template: formData.get("template"),
    frequency: formData.get("frequency"),
    dayOfMonth: formData.get("dayOfMonth"),
    dayOfWeek: formData.get("dayOfWeek"),
    hourOfDay: formData.get("hourOfDay"),
    recipients: formData.get("recipients"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const recipients = parseRecipients(parsed.data.recipients);
  if (recipients.length === 0) {
    return { ok: false, error: "No valid email addresses found" };
  }

  const next = computeNextSendAt({
    frequency: parsed.data.frequency,
    dayOfMonth: parsed.data.dayOfMonth,
    dayOfWeek: parsed.data.dayOfWeek,
    hourOfDay: parsed.data.hourOfDay,
  });

  // Upsert: one schedule per (clientId, template) — keeps UX simple
  const existing = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.clientId, parsed.data.clientId));

  const matchSameTemplate = existing.find(
    (s) => s.template === parsed.data.template,
  );

  if (matchSameTemplate) {
    await db
      .update(reportSchedules)
      .set({
        template: parsed.data.template,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        dayOfWeek: parsed.data.dayOfWeek,
        hourOfDay: parsed.data.hourOfDay,
        recipients,
        enabled: true,
        nextSendAt: next,
        updatedAt: new Date(),
      })
      .where(eq(reportSchedules.id, matchSameTemplate.id));
    revalidatePath(`/clients/${parsed.data.clientId}`);
    return { ok: true, id: matchSameTemplate.id };
  }

  const [row] = await db
    .insert(reportSchedules)
    .values({
      clientId: parsed.data.clientId,
      template: parsed.data.template,
      frequency: parsed.data.frequency,
      dayOfMonth: parsed.data.dayOfMonth,
      dayOfWeek: parsed.data.dayOfWeek,
      hourOfDay: parsed.data.hourOfDay,
      recipients,
      enabled: true,
      nextSendAt: next,
    })
    .returning({ id: reportSchedules.id });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function deleteSchedule(scheduleId: number, clientId: number) {
  await db
    .delete(reportSchedules)
    .where(eq(reportSchedules.id, scheduleId));
  revalidatePath(`/clients/${clientId}`);
}

export async function sendReportNow(opts: {
  clientId: number;
  template: "executive" | "detailed" | "technical";
  recipients: string;
}): Promise<{ ok: boolean; error?: string }> {
  const smtp = await getSmtpConfig();
  if (!smtp) {
    return {
      ok: false,
      error: "SMTP not configured. Set it up in Settings → Email delivery first.",
    };
  }

  const list = parseRecipients(opts.recipients);
  if (list.length === 0) {
    return { ok: false, error: "Add at least one valid email address." };
  }

  const r = await sendReportEmail({
    clientId: opts.clientId,
    template: opts.template,
    recipients: list,
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/clients/${opts.clientId}`);
  return { ok: true };
}
