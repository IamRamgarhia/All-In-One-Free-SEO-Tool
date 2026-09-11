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

/**
 * The service account route, which is the other way to connect Google.
 *
 * Kept beside the OAuth actions above rather than in their own file
 * because they are two ways to do one thing, and a reader deciding
 * between them should not have to find the second one.
 */
export async function saveServiceAccount(
  _prev: { ok: boolean; error?: string; email?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; email?: string }> {
  const { saveServiceAccountKey } = await import("@/lib/google-service-account");
  const raw = String(formData.get("json") ?? "");
  const result = await saveServiceAccountKey(raw);
  if (!result.ok) return { ok: false, error: result.error };

  await logActivity({
    kind: "google.service_account_saved",
    // The email, not the key. It is the thing the user must go and paste
    // into Search Console, so it is worth having in the log.
    message: `Connected Google with service account ${result.email}.`,
    level: "info",
  });
  revalidatePath("/settings/google");
  return { ok: true, email: result.email };
}

export async function removeServiceAccount() {
  const { clearServiceAccount } = await import("@/lib/google-service-account");
  await clearServiceAccount();
  await logActivity({
    kind: "google.service_account_cleared",
    message: "Removed the Google service account key.",
    level: "info",
  });
  revalidatePath("/settings/google");
}

/**
 * Prove the key works before the user walks away believing it does.
 *
 * A saved key that Google will not accept is the failure this whole
 * feature exists to avoid: the OAuth flow's worst trait is that it
 * appears to succeed and stops working a week later. So the setup screen
 * asks Google for a token and reports what came back.
 */
export async function testServiceAccount(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const { serviceAccountAccessToken, serviceAccountEmail } = await import(
    "@/lib/google-service-account"
  );
  try {
    const token = await serviceAccountAccessToken();
    if (!token) return { ok: false, detail: "No service account key saved yet." };
    const email = await serviceAccountEmail();
    const res = await fetch(
      "https://www.googleapis.com/webmasters/v3/sites",
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return {
        ok: false,
        detail: `Google accepted the key but refused Search Console (${res.status}). Add ${email} as a user on the property in Search Console, then try again.`,
      };
    }
    const body = (await res.json()) as { siteEntry?: { siteUrl: string }[] };
    const sites = body.siteEntry ?? [];
    if (sites.length === 0) {
      return {
        ok: false,
        detail: `The key works, but this service account can see no properties. In Search Console open Settings, Users and permissions, and add ${email} as a user.`,
      };
    }
    return {
      ok: true,
      detail: `Working. ${sites.length} propert${sites.length === 1 ? "y" : "ies"} visible: ${sites.map((s) => s.siteUrl).join(", ")}`,
    };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}
