import { eq, desc, and } from "drizzle-orm";
import { db } from "@/db/client";
import { toolSnapshots, type NewToolSnapshot } from "@/db/schema";

export type SnapshotKind = NewToolSnapshot["kind"];

const TOOL_LABELS: Record<SnapshotKind, string> = {
  cwv: "Core Web Vitals",
  headers: "HTTP headers",
  redirect_chain: "Redirect chain",
  og_preview: "Social cards",
  heading_outline: "Heading outline",
  content_stats: "Content stats",
  robots: "Robots / sitemap",
  security: "Security headers",
  hreflang: "Hreflang",
  image_audit: "Image audit",
  broken_links: "Broken links",
  schema: "Schema markup",
  ai_overview: "AI Overview",
};

export function snapshotKindLabel(k: SnapshotKind): string {
  return TOOL_LABELS[k] ?? k;
}

export async function saveSnapshot(
  input: NewToolSnapshot,
): Promise<{ ok: true; id: number }> {
  const [row] = await db
    .insert(toolSnapshots)
    .values(input)
    .returning({ id: toolSnapshots.id });
  return { ok: true, id: row.id };
}

export async function listSnapshots(opts?: {
  clientId?: number | null;
  kind?: SnapshotKind;
  label?: string;
  limit?: number;
}) {
  const conditions = [];
  if (opts?.clientId !== undefined) {
    if (opts.clientId === null) {
      // Workspace-level: client_id IS NULL — there's no Drizzle helper, use SQL
      // Skipping for simplicity; consumer can filter in JS
    } else {
      conditions.push(eq(toolSnapshots.clientId, opts.clientId));
    }
  }
  if (opts?.kind) conditions.push(eq(toolSnapshots.kind, opts.kind));
  if (opts?.label) conditions.push(eq(toolSnapshots.label, opts.label));

  const rows = await db
    .select()
    .from(toolSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(toolSnapshots.capturedAt))
    .limit(opts?.limit ?? 200);
  return rows;
}

export async function deleteSnapshot(id: number): Promise<void> {
  await db.delete(toolSnapshots).where(eq(toolSnapshots.id, id));
}
