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
  | "google.connected"
  | "google.disconnected"
  | "google.credentials_cleared";

export type ActivityLevel = "info" | "success" | "warning" | "error";

export async function logActivity(opts: {
  kind: ActivityKind;
  message: string;
  level?: ActivityLevel;
  clientId?: number | null;
  entityType?: string;
  entityId?: number;
}): Promise<void> {
  try {
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
