import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog } from "@/db/schema";
import { currentUserId } from "./auth";
import { getReportLocale } from "./report-i18n";

export type ActivityKind =
  | "client.created"
  | "client.deleted"
  | "audit.completed"
  | "audit.failed"
  | "task.completed"
  | "task.created"
  | "task.template_skipped"
  | "page.changed"
  | "rank.changed"
  | "report.generated"
  | "outreach.contacted"
  | "outreach.replied"
  | "outreach.sent"
  | "google.connected"
  | "google.disconnected"
  | "google.credentials_cleared"
  | "google.service_account_saved"
  | "google.service_account_cleared"
  | "agent.level_chosen"
  /**
   * A bounded trial was run: a few queued safe changes applied on
   * request, granting the agent nothing. Logged so the activity trail
   * distinguishes "the user pressed try it" from the agent acting on a
   * standing permission.
   */
  | "agent.trial_run"
  /**
   * A fix confirmed gone from the live page (re-fetched), by the agent
   * after applying it or on request from the audit page. Distinct from
   * an action's own `verified` status, which only means the CMS stored
   * the value: the gap between the two is a page cache.
   */
  | "agent.fix_confirmed"
  /**
   * A fix that was made (or said to be made) but is still visible on the
   * live page. Logged rather than retried, because the cause is almost
   * always a cache or a theme override on the user's side.
   */
  | "agent.fix_not_live"
  | "edge.token_rotated"
  // Who may do what, for the journal on Settings → Team.
  | "team.invited"
  | "team.invite_cancelled"
  | "team.role_changed"
  | "team.deactivated"
  // IA-5: AI step in an automation.
  | "automation.ai_step"
  | "automation.paused"
  | "team.reactivated"
  | "team.access_changed"
  | "account.password_changed"
  // The client approved a draft, or asked for changes, from their portal.
  | "portal.client_review";

export type ActivityLevel = "info" | "success" | "warning" | "error";

export async function logActivity(opts: {
  kind: ActivityKind;
  message: string;
  /**
   * The same message in French. Written instead of `message` when the
   * workspace language is French, so a new entry reads in the language of
   * the workspace; entries already stored stay as they are.
   */
  messageFr?: string;
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
  // Known tradeoff: this is a SELECT-then-INSERT pattern with no real
  // atomicity. Under concurrent renders (e.g. two pages loading the
  // sidebar at once) both can pass the existence check before either
  // inserts, producing duplicate rows. better-sqlite3 is single-process
  // but the async drizzle wrapper allows event-loop interleave.
  //
  // Worst case: a couple of duplicate notifications per concurrent
  // burst, then the 24h dedup window prevents further duplicates. The
  // user dismisses them and moves on. Not worth a new migration + unique
  // partial index for the rare event.
  try {
    const message =
      opts.messageFr !== undefined && (await getReportLocale()) === "fr"
        ? opts.messageFr
        : opts.message;
    if (opts.dedupe !== false) {
      const windowMs = (opts.dedupeWindowMinutes ?? 60 * 24) * 60 * 1000;
      const cutoff = new Date(Date.now() - windowMs);
      const existing = await db
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.kind, opts.kind),
            eq(activityLog.message, message),
            gt(activityLog.createdAt, cutoff),
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(1);
      if (existing.length > 0) return;
    }
    await db.insert(activityLog).values({
      kind: opts.kind,
      message,
      level: opts.level ?? "info",
      clientId: opts.clientId ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
      // Attribution is resolved here rather than passed by each of the
      // ~40 call sites, because a parameter that every caller has to
      // remember is a parameter most callers will forget. Null when the
      // scheduler did it, or on a solo install — both honest answers.
      userId: await currentUserId(),
    });
  } catch {
    // Never let activity logging break the main flow
  }
}
