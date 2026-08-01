/**
 * Invitations.
 *
 * The owner generates a link; the invitee opens it and sets their own
 * password. Nobody ever types a password on someone else's behalf, which
 * removes the single most common way small teams end up sharing one.
 *
 * Delivery is deliberately out of scope: this returns a link and the
 * owner sends it however they already talk to their team. Requiring SMTP
 * to add a second person to a self-hosted tool would gate the feature
 * behind mail-server configuration, which is exactly the kind of
 * five-things-before-value setup this project avoids.
 */

import crypto from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { userInvites, users, type Role, type UserInvite } from "@/db/schema";
import { normaliseEmail, registerUser, markAccountsEnabled } from "./auth";

/** 7 days. Long enough for someone on holiday, short enough to expire. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export type CreatedInvite = { token: string; invite: UserInvite };

export async function createInvite(input: {
  email: string;
  role: Role;
  invitedBy: number | null;
}): Promise<{ ok: true; result: CreatedInvite } | { ok: false; error: string }> {
  const email = normaliseEmail(input.email);
  if (!email.includes("@")) {
    return { ok: false, error: "That doesn't look like an email address." };
  }

  const existingUser = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .get();
  if (existingUser) {
    return { ok: false, error: "That person already has an account." };
  }

  // Supersede any outstanding invite for the same address, so re-sending
  // doesn't leave two live links with possibly different roles.
  db.delete(userInvites)
    .where(and(sql`lower(${userInvites.email}) = ${email}`, isNull(userInvites.acceptedAt)))
    .run();

  const token = crypto.randomBytes(24).toString("base64url");
  const invite = db
    .insert(userInvites)
    .values({
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning()
    .get();

  return { ok: true, result: { token, invite } };
}

export function findInvite(token: string): UserInvite | null {
  if (!token) return null;
  const invite = db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, hashToken(token)))
    .get();
  if (!invite) return null;
  if (invite.acceptedAt) return null;
  if (invite.expiresAt.getTime() <= Date.now()) return null;
  return invite;
}

export async function acceptInvite(input: {
  token: string;
  password: string;
  name?: string;
}): Promise<{ ok: true; userId: number } | { ok: false; error: string }> {
  const invite = findInvite(input.token);
  if (!invite) {
    return {
      ok: false,
      error: "That invite link is invalid or has expired. Ask for a new one.",
    };
  }

  const created = await registerUser({
    email: invite.email,
    password: input.password,
    name: input.name,
    role: invite.role,
    allowWhenAccountsExist: true,
  });
  if (!created.ok) return { ok: false, error: created.error };

  db.update(userInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(userInvites.id, invite.id))
    .run();

  markAccountsEnabled();
  return { ok: true, userId: created.user.id };
}

export type PendingInvite = {
  id: number;
  email: string;
  role: Role;
  expiresInDays: number;
};

/**
 * Returns days-remaining rather than a timestamp because the caller is a
 * React server component, and reading the clock during render is exactly
 * what React's purity rule forbids — it makes the component
 * non-idempotent and lets the server and client print different numbers.
 * Doing the arithmetic here keeps that out of the render path.
 */
export function pendingInvites(): PendingInvite[] {
  const now = Date.now();
  return db
    .select()
    .from(userInvites)
    .where(isNull(userInvites.acceptedAt))
    .all()
    .filter((i) => i.expiresAt.getTime() > now)
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresInDays: Math.max(
        0,
        Math.ceil((i.expiresAt.getTime() - now) / 86_400_000),
      ),
    }));
}

export function revokeInvite(id: number): void {
  db.delete(userInvites).where(eq(userInvites.id, id)).run();
}
