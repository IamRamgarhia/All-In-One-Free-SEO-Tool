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
      lastStatus: monitoredPages.lastStatus,
      lastRobots: monitoredPages.lastRobots,
      lastSchemaTypes: monitoredPages.lastSchemaTypes,
      lastSchemaHash: monitoredPages.lastSchemaHash,
      clientId: monitoredPages.clientId,
      clientName: clients.name,
    })
    .from(monitoredPages)
    .leftJoin(clients, eq(monitoredPages.clientId, clients.id))
    .where(eq(monitoredPages.id, monitoredPageId))
    .limit(1);

  if (!page) return { changes: 0, error: "Page not found" };

  const fetched = await fetchSnapshot(page.url);
  if (!fetched.ok) {
    // Not reachable at all, so nothing is known about the page — not
    // the same as a page answering with an error, which is recorded.
    return { changes: 0, error: fetched.error };
  }
  const snap = fetched.snapshot;

  const hasSnapshot = page.lastContentHash !== null || page.lastStatus !== null;
  const prevSnapshot = hasSnapshot
    ? {
        title: page.lastTitle,
        description: page.lastDescription,
        h1: page.lastH1,
        canonical: page.lastCanonical,
        contentHash: page.lastContentHash ?? undefined,
        // Rows from before these were recorded leave them out, which
        // tells diffSnapshots not to compare them.
        ...(page.lastStatus !== null
          ? {
              status: page.lastStatus,
              robots: page.lastRobots,
              schemaTypes: page.lastSchemaTypes,
              schemaHash: page.lastSchemaHash,
            }
          : {}),
      }
    : null;

  const diffs = diffSnapshots(prevSnapshot, snap);

  if (diffs.length > 0) {
    await db.insert(pageChanges).values(
      diffs.map((d) => ({
        monitoredPageId: page.id,
        field: d.field,
        severity: d.severity,
        oldValue: d.oldValue,
        newValue: d.newValue,
      })),
    );
  }

  const checkedAt = new Date();
  await db
    .update(monitoredPages)
    .set(
      snap.status >= 400
        ? // Keep the last good snapshot, so that when the page comes back
          // it is compared with what it was, not with an error page.
          { lastStatus: snap.status, lastCheckedAt: checkedAt, updatedAt: checkedAt }
        : {
            lastTitle: snap.title,
            lastDescription: snap.description,
            lastH1: snap.h1,
            lastCanonical: snap.canonical,
            lastContentHash: snap.contentHash,
            lastStatus: snap.status,
            lastRobots: snap.robots,
            lastSchemaTypes: snap.schemaTypes,
            lastSchemaHash: snap.schemaHash,
            lastCheckedAt: checkedAt,
            updatedAt: checkedAt,
          },
    )
    .where(eq(monitoredPages.id, page.id));

  // Silent mode (initial seed) skips notifications.
  if (!silent) {
    const label = page.label ?? page.url;
    const alerts = diffs.filter((d) => d.severity !== "info");
    if (alerts.length > 0) {
      const critical = alerts.filter((d) => d.severity === "critical").length;
      notify({
        title: `${critical > 0 ? "Critical page change" : "Page changed"} — ${page.clientName ?? "Client"}`,
        body: `${alerts.length} change${alerts.length === 1 ? "" : "s"} on ${label}${critical > 0 ? `, ${critical} critical` : ""}.`,
        level: critical > 0 ? "error" : "warning",
        fields: alerts.slice(0, 4).map((d) => ({
          label: `${d.field} · ${d.severity}`,
          value: `${d.reason} "${(d.oldValue ?? "—").slice(0, 40)}" → "${(d.newValue ?? "—").slice(0, 40)}"`,
        })),
      }).catch(() => {});
    }

    // Automations keep their original trigger — any change other than
    // body text — so workflows people already built fire as before.
    const meaningful = diffs.filter((d) => d.field !== "content");
    if (meaningful.length > 0) {
      await runAutomations("page_change", {
        clientId: page.clientId,
        clientName: page.clientName,
        data: {
          url: page.url,
          fields: meaningful.map((d) => d.field).join(", "),
          changeCount: meaningful.length,
          criticalCount: meaningful.filter((d) => d.severity === "critical").length,
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
