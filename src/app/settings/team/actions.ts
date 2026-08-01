"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clientMembers, users, type Role } from "@/db/schema";
import { canManageTeam, currentUser, seesAllClients } from "@/lib/auth";
import { createInvite, revokeInvite } from "@/lib/invites";

/**
 * Every action here re-checks the caller's role server-side. The UI
 * already hides these controls from non-owners, but hiding a button is
 * a courtesy, not a permission — a server action is a public endpoint
 * with a nicer calling convention.
 */
async function requireOwner(): Promise<{ id: number } | { error: string }> {
  const me = await currentUser();
  if (!me) return { error: "You need to be signed in." };
  if (!canManageTeam(me.role)) {
    return { error: "Only the owner can manage the team." };
  }
  return { id: me.id };
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function inviteMember(input: {
  email: string;
  role: Role;
}): Promise<ActionResult & { link?: string }> {
  const me = await requireOwner();
  if ("error" in me) return { ok: false, error: me.error };

  const created = await createInvite({
    email: input.email,
    role: input.role,
    invitedBy: me.id,
  });
  if (!created.ok) return { ok: false, error: created.error };

  revalidatePath("/settings/team");
  // The link is returned rather than emailed. Requiring SMTP to add a
  // second person to a self-hosted tool would put the feature behind
  // mail-server setup; copying a link into Slack takes five seconds.
  return { ok: true, link: `/invite/${created.result.token}` };
}

export async function cancelInvite(id: number): Promise<ActionResult> {
  const me = await requireOwner();
  if ("error" in me) return { ok: false, error: me.error };
  revokeInvite(id);
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function changeRole(
  userId: number,
  role: Role,
): Promise<ActionResult> {
  const me = await requireOwner();
  if ("error" in me) return { ok: false, error: me.error };

  // Don't let the last owner demote themselves into an instance nobody
  // can administer. There is no support desk to undo that.
  if (userId === me.id && role !== "owner") {
    const owners = db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "owner"), eq(users.active, true)))
      .get();
    if ((owners?.n ?? 0) <= 1) {
      return {
        ok: false,
        error:
          "You're the only owner. Promote someone else to owner first, then change your own role.",
      };
    }
  }

  db.update(users).set({ role }).where(eq(users.id, userId)).run();
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function setActive(
  userId: number,
  active: boolean,
): Promise<ActionResult> {
  const me = await requireOwner();
  if ("error" in me) return { ok: false, error: me.error };

  if (userId === me.id && !active) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  if (!active) {
    const owners = db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "owner"), eq(users.active, true)))
      .get();
    const target = db.select().from(users).where(eq(users.id, userId)).get();
    if (target?.role === "owner" && (owners?.n ?? 0) <= 1) {
      return { ok: false, error: "That's the only active owner." };
    }
  }

  // Deactivate, never delete: their name stays on the tasks they
  // completed and the reports that cite them. Deleting the row would
  // null out that history via ON DELETE SET NULL, which is a strange
  // way to remove someone from a team.
  db.update(users).set({ active }).where(eq(users.id, userId)).run();
  revalidatePath("/settings/team");
  return { ok: true };
}

export async function setClientAccess(
  userId: number,
  clientIds: number[],
): Promise<ActionResult> {
  const me = await requireOwner();
  if ("error" in me) return { ok: false, error: me.error };

  const target = db.select().from(users).where(eq(users.id, userId)).get();
  if (!target) return { ok: false, error: "No such user." };
  if (seesAllClients(target.role)) {
    return {
      ok: false,
      error: `${target.role === "owner" ? "Owners" : "Managers"} already see every client — assignments don't apply to them.`,
    };
  }

  db.delete(clientMembers).where(eq(clientMembers.userId, userId)).run();
  for (const clientId of clientIds) {
    db.insert(clientMembers).values({ userId, clientId }).run();
  }
  revalidatePath("/settings/team");
  return { ok: true, message: `${clientIds.length} client(s) assigned.` };
}
