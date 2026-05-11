import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog } from "@/db/schema";

export type ActivityKind =
  | "client.created"
  | "client.deleted"
  | "audit.completed"
  | "audit.failed"
  | "task.completed"
  | "task.created"
  | "page.changed"
  | "rank.changed"
  | "report.generated"
  | "outreach.contacted"
  | "outreach.replied"
  | "outreach.sent"
  | "google.connected"
  | "google.disconnected"
  | "google.credentials_cleared"
  | "system.update_available"
  | "system.updated";

export type ActivityLevel = "info" | "success" | "warning" | "error";

export async function logActivity(opts: {
  kind: ActivityKind;
  message: string;
  level?: ActivityLevel;
  clientId?: number | null;
  entityType?: string;
  entityId?: number;
  /**
   * If true, skip insertion when an identical (kind, message) entry was
   * created in the last `dedupeWindowMinutes` minutes. Prevents spam
   * when the same event (e.g. "update available for SHA abc1234") is
   * detected repeatedly across page loads.
   */
  dedupe?: boolean;
  dedupeWindowMinutes?: number;
}): Promise<void> {
  try {
    if (opts.dedupe !== false) {
      const windowMs = (opts.dedupeWindowMinutes ?? 60 * 24) * 60 * 1000;
      const cutoff = new Date(Date.now() - windowMs);
      const existing = await db
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.kind, opts.kind),
            eq(activityLog.message, opts.message),
            gt(activityLog.createdAt, cutoff),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(1);
      if (existing.length > 0) return;
    }
    await db.insert(activityLog).values({
      kind: opts.kind,
      message: opts.message,
      level: opts.level ?? "info",
      clientId: opts.clientId ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
    });
  } catch {
    // Never let activity logging break the main flow
  }
}
