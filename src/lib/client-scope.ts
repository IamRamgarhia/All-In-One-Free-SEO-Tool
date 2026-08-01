/**
 * Client visibility for members and viewers.
 *
 * Two things have to be true for "this person only sees their clients"
 * to actually hold:
 *
 *   1. Lists must not show clients they can't open.
 *   2. Typing the URL of one directly must not work either.
 *
 * (1) is `clientScope()` — a filter callers apply to their own query.
 * (2) is `assertClientAccess()`, wired in via a `layout.tsx` on each
 * per-client route segment, so it runs before the page renders and
 * cannot be forgotten by whoever writes the next page under it.
 *
 * On a solo install both are no-ops: `currentUser()` returns null, the
 * scope is "everything", and nothing changes. Owners and managers get
 * the same treatment by role. Only members and viewers pay the cost of
 * the filter, which is also the only case where the extra table lookup
 * is doing any work.
 */

import { cache } from "react";
import { notFound } from "next/navigation";
import { inArray, type SQL } from "drizzle-orm";
import { clients } from "@/db/schema";
import { currentUser, seesAllClients, visibleClientIds } from "./auth";

/**
 * `null` means unrestricted. Callers branch on that rather than being
 * handed a list of every id — an agency with 200 clients should not get
 * a 200-element IN clause on every page load to express "no limit".
 */
export const scopedClientIds = cache(async (): Promise<number[] | null> => {
  const me = await currentUser();
  if (!me) return null;
  if (seesAllClients(me.role)) return null;
  return visibleClientIds(me);
});

/**
 * A Drizzle condition to AND into a clients query, or undefined when the
 * caller should not filter at all.
 *
 * Usage:
 *   const scope = await clientScope();
 *   db.select().from(clients).where(scope)          // when that's the only filter
 *   db.select().from(clients).where(and(other, scope))  // and() drops undefined
 */
export async function clientScope(): Promise<SQL | undefined> {
  const ids = await scopedClientIds();
  if (ids === null) return undefined;
  // An empty assignment list means "no clients", not "all clients". The
  // difference is a member who has been given nothing yet seeing either
  // an empty page or the entire agency's book of business.
  if (ids.length === 0) return inArray(clients.id, [-1]);
  return inArray(clients.id, ids);
}

/**
 * Refuse the request if the signed-in user may not see this client.
 *
 * 404 rather than 403 on purpose: "you're not allowed to see client 12"
 * still confirms that client 12 exists. For an agency whose client list
 * is commercially sensitive, that is a real leak — a junior contractor
 * could enumerate ids and learn the whole roster.
 */
export async function assertClientAccess(clientId: number): Promise<void> {
  const ids = await scopedClientIds();
  if (ids === null) return;
  if (!ids.includes(clientId)) notFound();
}

/** Parses the `clientId` route param and asserts access in one step. */
export async function assertClientParam(raw: string | undefined): Promise<void> {
  const id = Number(raw);
  if (!Number.isInteger(id)) return; // let the page's own handling deal with it
  await assertClientAccess(id);
}
