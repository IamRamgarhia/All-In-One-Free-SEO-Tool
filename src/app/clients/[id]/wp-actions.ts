"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { encrypt } from "@/lib/crypto";
import {
  findPostIdByUrl,
  getClientWpCreds,
  pingWpBridge,
  setAttachmentAlt,
  setPostSchema,
  setPostSeo,
} from "@/lib/wp-bridge";

const credsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  endpoint: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  key: z.string().trim().min(8).max(200),
});

export type SaveCredsResult =
  | { ok: true; pluginVersion?: string }
  | { ok: false; error: string };

export async function saveWpCreds(
  _prev: SaveCredsResult | null,
  formData: FormData,
): Promise<SaveCredsResult> {
  const parsed = credsSchema.safeParse({
    clientId: formData.get("clientId"),
    endpoint: formData.get("endpoint"),
    key: formData.get("key"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Strip a trailing /wp-json/seo-tool/v1 if the user pasted the full URL
  let endpoint = parsed.data.endpoint.replace(/\/+$/, "");
  if (!endpoint.match(/\/wp-json\/seo-tool\/v1$/)) {
    if (endpoint.match(/\/wp-json\/?$/)) {
      endpoint = endpoint.replace(/\/?$/, "/seo-tool/v1");
    } else {
      endpoint = `${endpoint}/wp-json/seo-tool/v1`;
    }
  }

  // Verify connection before persisting
  const ping = await pingWpBridge({ endpoint, key: parsed.data.key });
  if (!ping.ok) {
    return {
      ok: false,
      error: `Couldn't reach the WP plugin at ${endpoint} — ${ping.error ?? "unknown error"}`,
    };
  }

  await db
    .update(clients)
    .set({
      wpEndpoint: endpoint,
      // WP application password — encrypted at rest. See lib/crypto.ts.
      wpKey: encrypt(parsed.data.key),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, parsed.data.clientId));

  await logActivity({
    kind: "client.created",
    message: `Connected WordPress bridge.`,
    level: "success",
    clientId: parsed.data.clientId,
    entityType: "wp_bridge",
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, pluginVersion: ping.version };
}

export async function disconnectWpBridge(clientId: number): Promise<void> {
  await db
    .update(clients)
    .set({ wpEndpoint: null, wpKey: null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
}

const fixSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  fixType: z.enum([
    "title",
    "meta_description",
    "canonical",
    "robots",
    "schema",
  ]),
  value: z.string().trim().min(1).max(20_000),
});

export type WpFixResult =
  | { ok: true; postId: number }
  | { ok: false; error: string };

/**
 * One-click "push this fix to WordPress." Resolves the URL to a post ID,
 * calls the appropriate REST endpoint, logs activity, and revalidates.
 */
export async function pushWpFix(
  _prev: WpFixResult | null,
  formData: FormData,
): Promise<WpFixResult> {
  const parsed = fixSchema.safeParse({
    clientId: formData.get("clientId"),
    url: formData.get("url"),
    fixType: formData.get("fixType"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const creds = await getClientWpCreds(parsed.data.clientId);
  if (!creds) {
    return {
      ok: false,
      error:
        "WordPress bridge not connected. Connect it on the client detail page first.",
    };
  }

  const postId = await findPostIdByUrl(creds, parsed.data.url);
  if (!postId) {
    return {
      ok: false,
      error: `Couldn't resolve ${parsed.data.url} to a WordPress post.`,
    };
  }

  let result: { ok: boolean; error?: string };
  switch (parsed.data.fixType) {
    case "title":
      result = await setPostSeo(creds, postId, { title: parsed.data.value });
      break;
    case "meta_description":
      result = await setPostSeo(creds, postId, {
        metaDescription: parsed.data.value,
      });
      break;
    case "canonical":
      result = await setPostSeo(creds, postId, {
        canonical: parsed.data.value,
      });
      break;
    case "robots":
      result = await setPostSeo(creds, postId, { robots: parsed.data.value });
      break;
    case "schema":
      result = await setPostSchema(creds, postId, parsed.data.value);
      break;
    default:
      result = { ok: false, error: "Unsupported fix type" };
  }

  if (!result.ok) {
    return { ok: false, error: result.error ?? "WP push failed" };
  }

  await logActivity({
    kind: "task.completed",
    message: `Pushed ${parsed.data.fixType.replace("_", " ")} update to WordPress (post #${postId})`,
    level: "success",
    clientId: parsed.data.clientId,
    entityType: "wp_bridge",
    entityId: postId,
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, postId };
}

/** Image-alt helper — same flow but uses the attachment endpoint. */
export async function pushImageAltFix(opts: {
  clientId: number;
  attachmentId: number;
  alt: string;
}): Promise<{ ok: boolean; error?: string }> {
  const creds = await getClientWpCreds(opts.clientId);
  if (!creds) return { ok: false, error: "WordPress bridge not connected." };
  const r = await setAttachmentAlt(creds, opts.attachmentId, opts.alt);
  if (!r.ok) return { ok: false, error: r.error };
  await logActivity({
    kind: "task.completed",
    message: `Pushed alt text to WordPress media #${opts.attachmentId}`,
    clientId: opts.clientId,
    entityType: "wp_bridge",
    entityId: opts.attachmentId,
  });
  return { ok: true };
}
