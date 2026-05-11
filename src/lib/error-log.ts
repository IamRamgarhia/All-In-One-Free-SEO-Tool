/**
 * Error log helper. Records exceptions to the system_errors table with
 * de-duplication: same (source, context, message) tuples increment an
 * occurrences counter instead of creating new rows.
 *
 * Designed to never throw — if logging itself fails, we eat the error
 * silently to avoid logging loops.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { systemErrors, type SystemError } from "@/db/schema";

const MAX_ROWS = 1000;

export type LogErrorInput = {
  source: "server" | "client" | "worker";
  context: string;
  error: unknown;
  url?: string | null;
  userAgent?: string | null;
};

function extract(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return {
      message: error.message.slice(0, 500) || error.name || "Unknown error",
      stack: error.stack ? error.stack.slice(0, 4000) : null,
    };
  }
  if (typeof error === "string") {
    return { message: error.slice(0, 500), stack: null };
  }
  try {
    return { message: JSON.stringify(error).slice(0, 500), stack: null };
  } catch {
    return { message: "Non-serializable error", stack: null };
  }
}

export async function logError(input: LogErrorInput): Promise<void> {
  try {
    const { message, stack } = extract(input.error);
    const context = input.context.slice(0, 200);

    // Try to find an existing dedupe row first.
    const [existing] = await db
      .select({ id: systemErrors.id, occurrences: systemErrors.occurrences })
      .from(systemErrors)
      .where(
        and(
          eq(systemErrors.source, input.source),
          eq(systemErrors.context, context),
          eq(systemErrors.message, message),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(systemErrors)
        .set({
          occurrences: existing.occurrences + 1,
          lastSeenAt: new Date(),
          // If newer call has a stack and old row didn't, update it
          ...(stack ? { stack } : {}),
          // Mark as un-resolved on recurrence — the user thought they'd
          // fixed it but it's back.
          resolved: false,
        })
        .where(eq(systemErrors.id, existing.id));
    } else {
      await db.insert(systemErrors).values({
        source: input.source,
        context,
        message,
        stack,
        url: input.url ?? null,
        userAgent: input.userAgent ?? null,
        occurrences: 1,
      });
      // Trim oldest if we've grown past MAX_ROWS. Single delete with a
      // subquery instead of N round-trips (used to fire one DELETE per
      // row — fine at 10 rows, sluggish at hundreds).
      const [{ value: total }] = await db
        .select({ value: sql<number>`count(*)` })
        .from(systemErrors);
      if (total > MAX_ROWS) {
        const toDelete = total - MAX_ROWS;
        await db.run(sql`
          DELETE FROM system_errors
          WHERE id IN (
            SELECT id FROM system_errors
            ORDER BY last_seen_at ASC
            LIMIT ${toDelete}
          )
        `);
      }
    }
  } catch {
    // Never throw from the error logger — would create a logging loop.
  }
}

export async function listErrors(opts: {
  limit?: number;
  includeResolved?: boolean;
} = {}): Promise<SystemError[]> {
  const limit = Math.min(opts.limit ?? 100, 500);
  if (opts.includeResolved) {
    return db
      .select()
      .from(systemErrors)
      .orderBy(desc(systemErrors.lastSeenAt))
      .limit(limit);
  }
  return db
    .select()
    .from(systemErrors)
    .where(eq(systemErrors.resolved, false))
    .orderBy(desc(systemErrors.lastSeenAt))
    .limit(limit);
}

export async function markErrorResolved(id: number): Promise<void> {
  await db
    .update(systemErrors)
    .set({ resolved: true })
    .where(eq(systemErrors.id, id));
}

export async function clearAllResolved(): Promise<number> {
  const r = await db
    .delete(systemErrors)
    .where(eq(systemErrors.resolved, true));
  // SQLite returns no row count by default through Drizzle; we don't expose
  // the count. Caller can re-list to refresh.
  void r;
  return 0;
}

/**
 * Wraps a server action / route handler in try/catch and auto-logs.
 * Rethrows so the caller's existing error handling still runs.
 */
export async function withErrorLog<T>(
  context: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    void logError({ source: "server", context, error: err });
    throw err;
  }
}
