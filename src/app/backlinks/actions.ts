"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { backlinks } from "@/db/schema";
import { logActivity } from "@/lib/activity";

const backlinkInput = z.object({
  clientId: z.coerce.number().int().positive(),
  sourceUrl: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  targetUrl: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  anchorText: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  domainAuthority: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .or(z.nan().transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type AddBacklinkResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function addBacklink(
  _prev: AddBacklinkResult | null,
  formData: FormData,
): Promise<AddBacklinkResult> {
  const raw = {
    clientId: formData.get("clientId"),
    sourceUrl: formData.get("sourceUrl"),
    targetUrl: formData.get("targetUrl") ?? undefined,
    anchorText: formData.get("anchorText") ?? undefined,
    domainAuthority: formData.get("domainAuthority") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
  const parsed = backlinkInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sourceDomain = new URL(parsed.data.sourceUrl).hostname.replace(
    /^www\./i,
    "",
  );

  const [row] = await db
    .insert(backlinks)
    .values({
      clientId: parsed.data.clientId,
      sourceUrl: parsed.data.sourceUrl,
      sourceDomain,
      targetUrl: parsed.data.targetUrl,
      anchorText: parsed.data.anchorText,
      domainAuthority: parsed.data.domainAuthority,
      notes: parsed.data.notes,
    })
    .returning({ id: backlinks.id });

  revalidatePath("/backlinks");
  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, id: row.id };
}

export async function setBacklinkStatus(
  backlinkId: number,
  status: "active" | "lost" | "disavow",
) {
  await db
    .update(backlinks)
    .set({ status, updatedAt: new Date() })
    .where(eq(backlinks.id, backlinkId));
  revalidatePath("/backlinks");
}

export async function deleteBacklink(backlinkId: number) {
  await db.delete(backlinks).where(eq(backlinks.id, backlinkId));
  revalidatePath("/backlinks");
}

// =============== Manual link log ===============

const linkLogInput = z.object({
  clientId: z.coerce.number().int().positive(),
  sourceUrl: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  targetUrl: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url())
    .optional()
    .or(z.literal("").transform(() => undefined)),
  anchorText: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
  method: z
    .enum([
      "guest_post",
      "outreach",
      "citation",
      "broken_link",
      "resource_page",
      "directory",
      "social_profile",
      "podcast",
      "interview",
      "other",
    ])
    .default("other"),
  rel: z
    .enum(["dofollow", "nofollow", "ugc", "sponsored"])
    .optional()
    .or(z.literal("").transform(() => undefined)),
  domainAuthority: z.coerce
    .number()
    .min(0)
    .max(100)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .or(z.nan().transform(() => undefined)),
  placedAt: z
    .string()
    .trim()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
});

export type LogLinkResult = { ok: true; id: number } | { ok: false; error: string };

/**
 * Log an outbound link the SEO actually built. Goes into the same backlinks
 * table as discovered links but with source="manual" so reports can split
 * "links built this period" from "links observed this period."
 */
export async function logBuiltLink(
  _prev: LogLinkResult | null,
  formData: FormData,
): Promise<LogLinkResult> {
  const raw = {
    clientId: formData.get("clientId"),
    sourceUrl: formData.get("sourceUrl"),
    targetUrl: formData.get("targetUrl") ?? undefined,
    anchorText: formData.get("anchorText") ?? undefined,
    method: formData.get("method") || "other",
    rel: formData.get("rel") ?? undefined,
    domainAuthority: formData.get("domainAuthority") ?? undefined,
    placedAt: formData.get("placedAt") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  };
  const parsed = linkLogInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const sourceDomain = new URL(parsed.data.sourceUrl).hostname.replace(
    /^www\./i,
    "",
  );

  const placedDate = parsed.data.placedAt
    ? new Date(parsed.data.placedAt)
    : new Date();

  const [row] = await db
    .insert(backlinks)
    .values({
      clientId: parsed.data.clientId,
      sourceUrl: parsed.data.sourceUrl,
      sourceDomain,
      targetUrl: parsed.data.targetUrl ?? null,
      anchorText: parsed.data.anchorText ?? null,
      domainAuthority: parsed.data.domainAuthority ?? null,
      notes: parsed.data.notes ?? null,
      source: "manual",
      method: parsed.data.method,
      rel: parsed.data.rel ?? null,
      placedAt: placedDate,
      firstSeen: placedDate,
      lastSeen: placedDate,
    })
    .returning({ id: backlinks.id });

  // Auto-create a short link if a target URL was provided so we get
  // click attribution for traffic coming from this placed link.
  let shortSlug: string | null = null;
  if (parsed.data.targetUrl) {
    try {
      const { findUniqueSlug } = await import("@/lib/short-links");
      const { shortLinks } = await import("@/db/schema");
      shortSlug = await findUniqueSlug();
      await db.insert(shortLinks).values({
        clientId: parsed.data.clientId,
        slug: shortSlug,
        destination: parsed.data.targetUrl,
        label: `Auto: ${sourceDomain}`,
        utmSource: sourceDomain,
        utmMedium: "backlink",
        utmCampaign: `link-build-${parsed.data.method}`,
      });
      await db
        .update(backlinks)
        .set({
          notes:
            (parsed.data.notes ?? "") +
            (parsed.data.notes ? "\n" : "") +
            `Tracking: /r/${shortSlug}`,
        })
        .where(eq(backlinks.id, row.id));
    } catch {
      shortSlug = null;
    }
  }

  await logActivity({
    kind: "task.completed",
    message: `Logged link from ${sourceDomain} (method: ${parsed.data.method})${shortSlug ? ` · short link /r/${shortSlug}` : ""}`,
    level: "success",
    clientId: parsed.data.clientId,
    entityType: "backlink",
    entityId: row.id,
  });

  revalidatePath("/backlinks");
  revalidatePath(`/backlinks/c/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath("/links");
  return { ok: true, id: row.id };
}

// =============== Ahrefs Webmaster Tools CSV import ===============

export type AhrefsImportResult =
  | {
      ok: true;
      inserted: number;
      skipped: number;
      duplicates: number;
    }
  | { ok: false; error: string };

/**
 * Ingest a CSV exported from Ahrefs Webmaster Tools (free for verified
 * site owners). The export format is:
 *   Referring page URL, Referring page title, Type, External links,
 *   Internal links, Domain Rating, URL Rating, Domain traffic,
 *   Referring domains, Linked domains, Target URL, Anchor, Last seen
 *
 * We map: Referring page URL -> sourceUrl, Domain Rating -> domainAuthority,
 *         Target URL -> targetUrl, Anchor -> anchorText.
 *
 * Dedup is by (clientId, sourceUrl). Returns counts so the caller can
 * tell the user "Added 124 new, skipped 38 duplicates."
 */
export async function importAhrefsBacklinks(
  clientId: number,
  csvText: string,
): Promise<AhrefsImportResult> {
  if (!Number.isFinite(clientId) || clientId <= 0) {
    return { ok: false, error: "Invalid clientId" };
  }
  if (!csvText || csvText.length < 10) {
    return { ok: false, error: "CSV is empty or too short" };
  }

  // Minimal CSV parser — Ahrefs exports use comma + double-quoted
  // fields with escaped inner quotes. Stays in-process; no extra dep.
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { ok: false, error: "CSV must have a header row and at least one data row" };
  }

  const header = rows[0].map((h) => h.toLowerCase().trim());
  const idxSource = findColumn(header, ["referring page url", "source url", "source"]);
  const idxTarget = findColumn(header, ["target url", "target"]);
  const idxAnchor = findColumn(header, ["anchor", "anchor text"]);
  const idxDR = findColumn(header, ["domain rating", "dr"]);

  if (idxSource < 0) {
    return {
      ok: false,
      error:
        "CSV is missing a 'Referring page URL' column — this doesn't look like an Ahrefs WMT export.",
    };
  }

  // Pre-load existing source URLs for this client so we can dedup
  // without 1-row-at-a-time queries.
  const existing = await db
    .select({ sourceUrl: backlinks.sourceUrl })
    .from(backlinks)
    .where(eq(backlinks.clientId, clientId));
  const existingSet = new Set(existing.map((r) => normalizeUrl(r.sourceUrl)));

  let inserted = 0;
  let skipped = 0;
  let duplicates = 0;

  const batch: Array<{
    clientId: number;
    sourceUrl: string;
    sourceDomain: string;
    targetUrl: string | null;
    anchorText: string | null;
    domainAuthority: number | null;
    source: "ahrefs_wmt";
  }> = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const sourceUrlRaw = row[idxSource]?.trim() ?? "";
    if (!sourceUrlRaw) {
      skipped++;
      continue;
    }
    const sourceUrl = sourceUrlRaw.startsWith("http")
      ? sourceUrlRaw
      : `https://${sourceUrlRaw}`;
    let sourceDomain: string;
    try {
      sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./i, "");
    } catch {
      skipped++;
      continue;
    }
    if (existingSet.has(normalizeUrl(sourceUrl))) {
      duplicates++;
      continue;
    }
    const targetUrl =
      idxTarget >= 0 && row[idxTarget]?.trim() ? row[idxTarget].trim() : null;
    const anchorText =
      idxAnchor >= 0 && row[idxAnchor]?.trim() ? row[idxAnchor].trim() : null;
    let domainAuthority: number | null = null;
    if (idxDR >= 0 && row[idxDR]) {
      const n = Number(row[idxDR]);
      if (Number.isFinite(n) && n >= 0 && n <= 100) domainAuthority = n;
    }
    batch.push({
      clientId,
      sourceUrl,
      sourceDomain,
      targetUrl,
      anchorText,
      domainAuthority,
      source: "ahrefs_wmt",
    });
    existingSet.add(normalizeUrl(sourceUrl));
  }

  if (batch.length > 0) {
    // Insert in chunks of 500 to stay safely under SQLite parameter limits.
    const CHUNK = 500;
    for (let i = 0; i < batch.length; i += CHUNK) {
      await db.insert(backlinks).values(batch.slice(i, i + CHUNK));
    }
    inserted = batch.length;
  }

  await logActivity({
    kind: "task.completed",
    message: `Ahrefs WMT import: +${inserted} new backlink${inserted === 1 ? "" : "s"} (${duplicates} duplicates, ${skipped} skipped)`,
    level: "success",
    clientId,
    entityType: "backlink",
  });

  revalidatePath("/backlinks");
  revalidatePath(`/backlinks/c/${clientId}`);
  return { ok: true, inserted, skipped, duplicates };
}

function normalizeUrl(u: string): string {
  return u.trim().toLowerCase().replace(/\/$/, "");
}

function findColumn(header: string[], needles: string[]): number {
  for (const n of needles) {
    const idx = header.indexOf(n);
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Tiny CSV parser. Handles double-quoted fields, escaped quotes (""),
 * and embedded newlines inside quoted cells. Ahrefs exports are well-
 * formed so this is sufficient; do not use for adversarial input.
 */
function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuote = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inQuote) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && input[i + 1] === "\n") i++;
        cur.push(field);
        field = "";
        rows.push(cur);
        cur = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}
