"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, tasks, type ClientSocialLinks } from "@/db/schema";
import { detectTechStack } from "@/lib/tech-detect";
import { fetchSiteMetadata, type SiteMetadata } from "@/lib/site-metadata";
import { getNicheTemplates } from "@/lib/niche-templates";
import {
  pickStackTemplates,
  type StackTaskTemplate,
} from "@/lib/tech-stack-templates";
import { logActivity } from "@/lib/activity";

const niches = ["local", "ecommerce", "saas", "blog", "services"] as const;

const optionalString = z
  .string()
  .trim()
  .max(500)
  .optional()
  .or(z.literal("").transform(() => undefined));

const clientInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url("Enter a valid URL")),
  niche: z.enum(niches).optional().or(z.literal("").transform(() => undefined)),
  // Optional pre-populated fields (from auto-fetch). All best-effort.
  logoUrl: optionalString,
  description: optionalString,
  address: optionalString,
  phone: optionalString,
  email: optionalString,
  gbpUrl: optionalString,
  facebook: optionalString,
  twitter: optionalString,
  instagram: optionalString,
  linkedin: optionalString,
  youtube: optionalString,
  tiktok: optionalString,
});

export type ClientMetadataResult =
  | { ok: true; metadata: SiteMetadata }
  | { ok: false; error: string };

/**
 * Fetch og/JSON-LD/social/favicon data for a URL so the add-client form can
 * pre-populate fields. Errors return a friendly message rather than throwing.
 */
export async function fetchClientMetadata(
  rawUrl: string,
): Promise<ClientMetadataResult> {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a URL first." };
  }
  try {
    const metadata = await fetchSiteMetadata(trimmed);
    if (!metadata.reachable) {
      return {
        ok: false,
        error:
          "Couldn't reach that URL. Check it loads in a browser, then try again.",
      };
    }
    return { ok: true, metadata };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Fetch failed." };
  }
}

export type CreateClientResult =
  | { ok: true; id: number }
  | { ok: false; errors: Record<string, string> };

export async function createClient(
  _prev: CreateClientResult | null,
  formData: FormData,
): Promise<CreateClientResult> {
  const raw = {
    name: formData.get("name"),
    url: formData.get("url"),
    niche: formData.get("niche") ?? undefined,
    logoUrl: formData.get("logoUrl") ?? undefined,
    description: formData.get("description") ?? undefined,
    address: formData.get("address") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    gbpUrl: formData.get("gbpUrl") ?? undefined,
    facebook: formData.get("facebook") ?? undefined,
    twitter: formData.get("twitter") ?? undefined,
    instagram: formData.get("instagram") ?? undefined,
    linkedin: formData.get("linkedin") ?? undefined,
    youtube: formData.get("youtube") ?? undefined,
    tiktok: formData.get("tiktok") ?? undefined,
  };

  const parsed = clientInput.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  let detectedStack: string[] | null = null;
  try {
    const detection = await detectTechStack(parsed.data.url);
    detectedStack = detection.technologies.map((t) => t.name);
  } catch {
    // Detection is best-effort — site may be unreachable, blocked, etc.
    // We still create the client; user can retry detection from the detail page.
  }

  const socialLinks: ClientSocialLinks = {};
  if (parsed.data.facebook) socialLinks.facebook = parsed.data.facebook;
  if (parsed.data.twitter) socialLinks.twitter = parsed.data.twitter;
  if (parsed.data.instagram) socialLinks.instagram = parsed.data.instagram;
  if (parsed.data.linkedin) socialLinks.linkedin = parsed.data.linkedin;
  if (parsed.data.youtube) socialLinks.youtube = parsed.data.youtube;
  if (parsed.data.tiktok) socialLinks.tiktok = parsed.data.tiktok;

  const [row] = await db
    .insert(clients)
    .values({
      name: parsed.data.name,
      url: parsed.data.url,
      niche: parsed.data.niche,
      techStack: detectedStack,
      logoUrl: parsed.data.logoUrl ?? null,
      description: parsed.data.description ?? null,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      gbpUrl: parsed.data.gbpUrl ?? null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
    })
    .returning({ id: clients.id });

  // Auto-seed niche-specific tasks (CLAUDE.md Part 3.3)
  await applyNicheTemplatesInternal(row.id, parsed.data.niche);

  // Auto-seed tech-stack-aware checklist (CLAUDE.md Part 3.2 + Part 10)
  await applyStackTemplatesInternal(row.id, detectedStack);

  await logActivity({
    kind: "client.created",
    message: `Added client ${parsed.data.name} (${parsed.data.url}).`,
    level: "success",
    clientId: row.id,
    entityType: "client",
    entityId: row.id,
  });

  revalidatePath("/");
  revalidatePath("/clients");
  redirect(`/clients/${row.id}`);
}

async function applyStackTemplatesInternal(
  clientId: number,
  detectedStack: string[] | null,
): Promise<{ added: number; skipped: number }> {
  const { tasks: stackTasks } = pickStackTemplates(detectedStack);
  if (stackTasks.length === 0) return { added: 0, skipped: 0 };

  // Idempotent: skip templates whose title already exists for this client.
  const existing = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        inArray(
          tasks.title,
          stackTasks.map((t) => t.title),
        ),
      ),
    );

  const existingTitles = new Set(existing.map((e) => e.title));
  const toInsert = stackTasks.filter((t) => !existingTitles.has(t.title));

  if (toInsert.length > 0) {
    await db.insert(tasks).values(
      toInsert.map((t: StackTaskTemplate) => ({
        clientId,
        title: t.title,
        description: t.description,
        whyItMatters: t.whyItMatters,
        priority: t.priority,
        status: "todo" as const,
      })),
    );
  }

  return { added: toInsert.length, skipped: existingTitles.size };
}

export async function applyStackTemplates(clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return;

  await applyStackTemplatesInternal(clientId, client.techStack);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
}

async function applyNicheTemplatesInternal(
  clientId: number,
  niche: string | null | undefined,
): Promise<{ added: number; skipped: number }> {
  const templates = getNicheTemplates(niche);
  if (templates.length === 0) return { added: 0, skipped: 0 };

  // Idempotent: skip templates whose title already exists for this client.
  const existing = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        inArray(
          tasks.title,
          templates.map((t) => t.title),
        ),
      ),
    );

  const existingTitles = new Set(existing.map((e) => e.title));
  const toInsert = templates.filter((t) => !existingTitles.has(t.title));

  if (toInsert.length > 0) {
    await db.insert(tasks).values(
      toInsert.map((t) => ({
        clientId,
        title: t.title,
        description: t.description,
        whyItMatters: t.whyItMatters,
        priority: t.priority,
        status: "todo" as const,
      })),
    );
  }

  return { added: toInsert.length, skipped: existingTitles.size };
}

export async function applyNicheTemplates(clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return;

  await applyNicheTemplatesInternal(clientId, client.niche);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/tasks");
  revalidatePath("/");
}

export async function redetectTechStack(clientId: number) {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return;

  try {
    const detection = await detectTechStack(client.url);
    await db
      .update(clients)
      .set({
        techStack: detection.technologies.map((t) => t.name),
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId));
  } catch {
    // ignore — keep existing data
  }

  revalidatePath(`/clients/${clientId}`);
}

const updateClientInput = clientInput.extend({
  id: z.coerce.number().int().positive(),
});

export type UpdateClientResult =
  | { ok: true; id: number }
  | { ok: false; errors: Record<string, string> };

export async function updateClient(
  _prev: UpdateClientResult | null,
  formData: FormData,
): Promise<UpdateClientResult> {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    url: formData.get("url"),
    niche: formData.get("niche") ?? undefined,
    logoUrl: formData.get("logoUrl") ?? undefined,
    description: formData.get("description") ?? undefined,
    address: formData.get("address") ?? undefined,
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    gbpUrl: formData.get("gbpUrl") ?? undefined,
    facebook: formData.get("facebook") ?? undefined,
    twitter: formData.get("twitter") ?? undefined,
    instagram: formData.get("instagram") ?? undefined,
    linkedin: formData.get("linkedin") ?? undefined,
    youtube: formData.get("youtube") ?? undefined,
    tiktok: formData.get("tiktok") ?? undefined,
  };

  const parsed = updateClientInput.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]?.toString() ?? "_";
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }

  const socialLinks: ClientSocialLinks = {};
  if (parsed.data.facebook) socialLinks.facebook = parsed.data.facebook;
  if (parsed.data.twitter) socialLinks.twitter = parsed.data.twitter;
  if (parsed.data.instagram) socialLinks.instagram = parsed.data.instagram;
  if (parsed.data.linkedin) socialLinks.linkedin = parsed.data.linkedin;
  if (parsed.data.youtube) socialLinks.youtube = parsed.data.youtube;
  if (parsed.data.tiktok) socialLinks.tiktok = parsed.data.tiktok;

  await db
    .update(clients)
    .set({
      name: parsed.data.name,
      url: parsed.data.url,
      niche: parsed.data.niche,
      logoUrl: parsed.data.logoUrl ?? null,
      description: parsed.data.description ?? null,
      address: parsed.data.address ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      gbpUrl: parsed.data.gbpUrl ?? null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      updatedAt: new Date(),
    })
    .where(eq(clients.id, parsed.data.id));

  await logActivity({
    kind: "client.created", // reuse "client.created" for now since edit isn't a kind
    message: `Updated client ${parsed.data.name}.`,
    level: "info",
    clientId: parsed.data.id,
    entityType: "client",
    entityId: parsed.data.id,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${parsed.data.id}`);
  redirect(`/clients/${parsed.data.id}`);
}

/**
 * Re-fetches site metadata + tech stack for an existing client and merges
 * non-empty fields into the record. Manually-set values are preserved when
 * the live site doesn't return anything for that field.
 */
export async function refreshClientMetadata(
  clientId: number,
): Promise<{ ok: boolean; error?: string }> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  const meta = await fetchSiteMetadata(client.url).catch(() => null);
  if (!meta || !meta.reachable) {
    return {
      ok: false,
      error: "Couldn't reach the site. Check the URL and try again.",
    };
  }

  // Merge: only overwrite fields if the fetched value is non-empty
  const next: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (meta.name && !client.name) next.name = meta.name;
  if (meta.logoUrl) next.logoUrl = meta.logoUrl;
  if (meta.description) next.description = meta.description;
  if (meta.address) next.address = meta.address;
  if (meta.phone) next.phone = meta.phone;
  if (meta.email) next.email = meta.email;
  if (meta.gbpUrl) next.gbpUrl = meta.gbpUrl;

  // Social: merge — keep existing, add anything new from fetch
  const incoming = meta.socialLinks ?? {};
  const existing: ClientSocialLinks = client.socialLinks ?? {};
  const merged: ClientSocialLinks = { ...existing };
  for (const k of Object.keys(incoming) as (keyof ClientSocialLinks)[]) {
    if (!merged[k] && incoming[k]) merged[k] = incoming[k];
  }
  if (Object.keys(merged).length > 0) next.socialLinks = merged;

  // Tech stack
  try {
    const detection = await detectTechStack(client.url);
    next.techStack = detection.technologies.map((t) => t.name);
  } catch {
    // ignore
  }

  await db.update(clients).set(next).where(eq(clients.id, clientId));

  await logActivity({
    kind: "client.created",
    message: `Refreshed metadata for ${client.name}.`,
    level: "info",
    clientId,
    entityType: "client",
    entityId: clientId,
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Form-friendly wrapper around refreshClientMetadata (returns void). */
export async function refreshClientMetadataForm(clientId: number): Promise<void> {
  await refreshClientMetadata(clientId);
}

export type QuickAddResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

/**
 * One-shot client onboarding: take a URL, do everything else automatically.
 * Fetches metadata (logo, name, description, social, address, phone),
 * detects tech stack, infers niche, seeds task templates, returns clientId.
 *
 * Used by the global "Add client" modal so onboarding is ~3 seconds.
 */
export async function quickAddClient(rawUrl: string): Promise<QuickAddResult> {
  const url = rawUrl?.trim();
  if (!url) return { ok: false, error: "URL is required" };
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  // Fetch metadata + tech in parallel — both best-effort.
  const [meta, techDetection] = await Promise.all([
    fetchSiteMetadata(normalized).catch(() => null),
    detectTechStack(normalized).catch(() => null),
  ]);

  if (!meta || !meta.reachable) {
    return {
      ok: false,
      error:
        "Couldn't reach that URL. Check it loads in a browser, then try again.",
    };
  }

  const techStack = techDetection?.technologies.map((t) => t.name) ?? null;

  // Auto-detect niche from tech stack
  const niche: "ecommerce" | "blog" | null = (() => {
    if (!techStack) return null;
    const set = new Set(techStack.map((s) => s.toLowerCase()));
    if (
      set.has("shopify") ||
      set.has("woocommerce") ||
      set.has("magento") ||
      set.has("bigcommerce")
    )
      return "ecommerce";
    if (set.has("ghost") || set.has("hugo") || set.has("jekyll")) return "blog";
    return null;
  })();

  const social = meta.socialLinks ?? {};

  const fallbackName = (() => {
    try {
      return new URL(meta.url).hostname.replace(/^www\./, "");
    } catch {
      return normalized;
    }
  })();

  const [row] = await db
    .insert(clients)
    .values({
      name: meta.name ?? fallbackName,
      url: meta.url,
      niche,
      techStack,
      logoUrl: meta.logoUrl ?? null,
      description: meta.description ?? null,
      address: meta.address ?? null,
      phone: meta.phone ?? null,
      email: meta.email ?? null,
      gbpUrl: meta.gbpUrl ?? null,
      socialLinks: Object.keys(social).length > 0 ? social : null,
    })
    .returning({ id: clients.id });

  // Seed niche + tech-stack tasks
  await applyNicheTemplatesInternal(row.id, niche);
  await applyStackTemplatesInternal(row.id, techStack);

  await logActivity({
    kind: "client.created",
    message: `Quick-added ${meta.name ?? fallbackName} (${meta.url}).`,
    level: "success",
    clientId: row.id,
    entityType: "client",
    entityId: row.id,
  });

  revalidatePath("/");
  revalidatePath("/clients");
  return { ok: true, id: row.id };
}

export async function deleteClient(id: number) {
  await db.delete(clients).where(eq(clients.id, id));
  revalidatePath("/");
  revalidatePath("/clients");
  redirect("/clients");
}
