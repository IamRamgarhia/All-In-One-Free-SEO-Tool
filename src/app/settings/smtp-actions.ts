"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setSetting, deleteSetting } from "@/lib/settings-store";
import { sendMail, verifySmtp } from "@/lib/mailer";

const schema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  password: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  fromEmail: z.string().trim().email("Enter a valid email"),
  fromName: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  secure: z.union([z.literal("true"), z.literal("false")]).optional(),
});

export type SaveSmtpResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export async function saveSmtpConfig(
  _prev: SaveSmtpResult | null,
  formData: FormData,
): Promise<SaveSmtpResult> {
  const parsed = schema.safeParse({
    host: formData.get("host"),
    port: formData.get("port"),
    user: formData.get("user"),
    password: formData.get("password"),
    fromEmail: formData.get("fromEmail"),
    fromName: formData.get("fromName"),
    secure: formData.get("secure") ?? undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0]?.toString() ?? "_";
      if (!errors[k]) errors[k] = issue.message;
    }
    return { ok: false, errors };
  }

  await Promise.all([
    setSetting("smtp.host", parsed.data.host),
    setSetting("smtp.port", String(parsed.data.port)),
    parsed.data.user
      ? setSetting("smtp.user", parsed.data.user)
      : deleteSetting("smtp.user"),
    parsed.data.password
      ? setSetting("smtp.password", parsed.data.password)
      : Promise.resolve(),
    setSetting("smtp.from_email", parsed.data.fromEmail),
    parsed.data.fromName
      ? setSetting("smtp.from_name", parsed.data.fromName)
      : deleteSetting("smtp.from_name"),
    setSetting("smtp.secure", parsed.data.secure ?? "false"),
  ]);

  revalidatePath("/settings");
  return { ok: true };
}

export async function testSmtpConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  return verifySmtp();
}

export async function sendTestEmail(
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await sendMail({
    to: [to],
    subject: "SEO Tool — SMTP test",
    text: "If you received this, your SMTP configuration is working. Reports will go out from this address.",
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error };
}

export async function clearSmtpConfig() {
  await Promise.all([
    deleteSetting("smtp.host"),
    deleteSetting("smtp.port"),
    deleteSetting("smtp.user"),
    deleteSetting("smtp.password"),
    deleteSetting("smtp.from_email"),
    deleteSetting("smtp.from_name"),
    deleteSetting("smtp.secure"),
  ]);
  revalidatePath("/settings");
}
