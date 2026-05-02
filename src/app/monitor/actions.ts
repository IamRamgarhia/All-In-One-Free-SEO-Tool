"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, monitoredPages, pageChanges } from "@/db/schema";
import { diffSnapshots, fetchSnapshot } from "@/lib/page-monitor";
import { notify } from "@/lib/notifier";
import { runAutomations } from "@/lib/automation-engine";

const addSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  url: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  label: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AddMonitorResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

export async function addMonitoredPage(
  _prev: AddMonitorResult | null,
  formData: FormData,
): Promise<AddMonitorResult> {
  const parsed = addSchema.safeParse({
    clientId: formData.get("clientId"),
    url: formData.get("url"),
    label: formData.get("label") ?? undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const [row] = await db
    .insert(monitoredPages)
    .values({
      clientId: parsed.data.clientId,
      url: parsed.data.url,
      label: parsed.data.label,
    })
    .returning({ id: monitoredPages.id });

  // Take initial snapshot so future checks can diff against it
  await checkPageChangesInternal(row.id, /* silent */ true);

  revalidatePath("/monitor");
  return { ok: true, id: row.id };
}

export async function deleteMonitoredPage(monitoredPageId: number) {
  await db
    .delete(monitoredPages)
    .where(eq(monitoredPages.id, monitoredPageId));
  revalidatePath("/monitor");
}

export async function setMonitorStatus(
  monitoredPageId: number,
  status: "active" | "paused",
) {
  await db
    .update(monitoredPages)
    .set({ status, updatedAt: new Date() })
    .where(eq(monitoredPages.id, monitoredPageId));
  revalidatePath("/monitor");
}

async function checkPageChangesInternal(
  monitoredPageId: number,
  silent = false,
): Promise<{ changes: number; error?: string }> {
  const [page] = await db
    .select({
      id: monitoredPages.id,
      url: monitoredPages.url,
      label: monitoredPages.label,
      lastTitle: monitoredPages.lastTitle,
      lastDescription: monitoredPages.lastDescription,
      lastH1: monitoredPages.lastH1,
      lastCanonical: monitoredPages.lastCanonical,
      lastContentHash: monitoredPages.lastContentHash,
      clientId: monitoredPages.clientId,
      clientName: clients.name,
    })
    .from(monitoredPages)
    .leftJoin(clients, eq(monitoredPages.clientId, clients.id))
    .where(eq(monitoredPages.id, monitoredPageId))
    .limit(1);

  if (!page) return { changes: 0, error: "Page not found" };

  const snap = await fetchSnapshot(page.url);
  if (!snap) {
    return { changes: 0, error: "Couldn't fetch the page" };
  }

  const prevSnapshot = page.lastContentHash
    ? {
        title: page.lastTitle,
        description: page.lastDescription,
        h1: page.lastH1,
        canonical: page.lastCanonical,
        contentHash: page.lastContentHash,
      }
    : null;

  const diffs = diffSnapshots(prevSnapshot, snap);

  // Persist changes
  if (diffs.length > 0) {
    await db.insert(pageChanges).values(
      diffs.map((d) => ({
        monitoredPageId: page.id,
        field: d.field,
        oldValue: d.oldValue,
        newValue: d.newValue,
      })),
    );
  }

  // Update snapshot fields
  await db
    .update(monitoredPages)
    .set({
      lastTitle: snap.title,
      lastDescription: snap.description,
      lastH1: snap.h1,
      lastCanonical: snap.canonical,
      lastContentHash: snap.contentHash,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(monitoredPages.id, page.id));

  // Notify if there are non-content changes (those are the meaningful SEO ones).
  // Silent mode (initial seed) skips notifications.
  if (!silent) {
    const meaningful = diffs.filter((d) => d.field !== "content");
    if (meaningful.length > 0) {
      const label = page.label ?? page.url;
      notify({
        title: `Page changed — ${page.clientName ?? "Client"}`,
        body: `${meaningful.length} field${meaningful.length === 1 ? "" : "s"} changed on ${label}.`,
        level: "warning",
        fields: meaningful.slice(0, 4).map((d) => ({
          label: d.field,
          value: `"${(d.oldValue ?? "—").slice(0, 60)}" → "${(d.newValue ?? "—").slice(0, 60)}"`,
        })),
      }).catch(() => {});

      await runAutomations("page_change", {
        clientId: page.clientId,
        clientName: page.clientName,
        data: {
          url: page.url,
          fields: meaningful.map((d) => d.field).join(", "),
          changeCount: meaningful.length,
        },
      });
    }
  }

  revalidatePath("/monitor");
  return { changes: diffs.length };
}

export async function checkPageChanges(monitoredPageId: number) {
  await checkPageChangesInternal(monitoredPageId);
}

export async function checkAllMonitoredPages() {
  const pages = await db
    .select({ id: monitoredPages.id })
    .from(monitoredPages)
    .where(eq(monitoredPages.status, "active"));

  // Sequential — keeps load light on a 2-core CPU and avoids hitting one host hard
  for (const p of pages) {
    await checkPageChangesInternal(p.id);
  }
  revalidatePath("/monitor");
}
