"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setSetting, deleteSetting } from "@/lib/settings-store";
import { disconnectGoogle } from "@/lib/google-oauth";
import { logActivity } from "@/lib/activity";

const credentialsSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(10, "Client ID looks too short")
    .regex(/\.apps\.googleusercontent\.com$/, "Doesn't look like a Google Client ID"),
  clientSecret: z.string().trim().min(10, "Client secret looks too short"),
});

export type SaveCredentialsResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

export async function saveGoogleCredentials(
  _prev: SaveCredentialsResult | null,
  formData: FormData,
): Promise<SaveCredentialsResult> {
  const parsed = credentialsSchema.safeParse({
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  await Promise.all([
    setSetting("google.client_id", parsed.data.clientId),
    setSetting("google.client_secret", parsed.data.clientSecret),
  ]);

  revalidatePath("/settings/google");
  return { ok: true };
}

export async function clearGoogleCredentials() {
  await disconnectGoogle();
  await Promise.all([
    deleteSetting("google.client_id"),
    deleteSetting("google.client_secret"),
  ]);
  await logActivity({
    kind: "google.credentials_cleared",
    message: "Cleared Google OAuth credentials.",
    level: "info",
  });
  revalidatePath("/settings/google");
}

export async function disconnectGoogleAccount() {
  await disconnectGoogle();
  await logActivity({
    kind: "google.disconnected",
    message: "Disconnected Google account.",
    level: "info",
  });
  revalidatePath("/settings/google");
}
