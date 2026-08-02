/**
 * Accounts, passwords, sessions and roles.
 *
 * Node runtime only. The edge half lives in session-token.ts; see its
 * header for why the work is split.
 *
 * The design decision worth stating up front: **accounts are opt-in.**
 * An install with zero rows in `users` behaves exactly as it did before
 * this file existed — `APP_PASSWORD` or nothing. That matters because
 * the majority of installs are one freelancer on one laptop, and forcing
 * them through a registration flow to keep using a tool they already had
 * would be a downgrade. The moment someone registers, the app switches
 * to real logins and stays there.
 */

import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clientMembers, users, type Role, type User } from "@/db/schema";
import { ensureSessionSecret } from "./session-secret";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSession,
  userFingerprint,
  verifySession,
} from "./session-token";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/**
 * scrypt with the parameters Node defaults to, salt stored inline.
 *
 * Not bcrypt/argon2 because both are native modules, and this project
 * already pays for one (better-sqlite3) — every extra native dependency
 * is another way `docker build` fails on someone's machine, which is a
 * failure mode this repo has actually had. scrypt is in Node's standard
 * library, is memory-hard, and is a perfectly respectable choice.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt:1:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const [, , salt, expectedHex] = parts;
  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, 64);
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/** Minimum we'll accept. Long beats complex; no character-class theatre. */
export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters. A short phrase you'll remember beats a short jumble you won't.`;
  }
  if (password.length > 200) return "That's longer than 200 characters.";
  return null;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Are accounts in use on this install?
 *
 * Every auth decision branches on this. Cached for the process lifetime
 * once true, because it is a one-way door — you cannot un-register the
 * first user — and this is called on effectively every request.
 */
let accountsEnabledCache = false;
export function accountsEnabled(): boolean {
  if (accountsEnabledCache) return true;
  try {
    const row = db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .get();
    const enabled = (row?.n ?? 0) > 0;
    if (enabled) accountsEnabledCache = true;
    return enabled;
  } catch {
    // Table missing — an install that hasn't run migration 0054 yet.
    // Same answer as "no accounts": keep the old behaviour.
    return false;
  }
}

/**
 * Call after creating the first user.
 *
 * The env var is the load-bearing part: middleware reads it to decide
 * whether to demand a session, and it runs in a sandbox that can't ask
 * the database. Without this line the very first owner would register
 * successfully and the whole app would stay wide open until the next
 * restart — the gate would exist but not be closed.
 */
export function markAccountsEnabled(): void {
  accountsEnabledCache = true;
  process.env.SEO_ACCOUNTS_ENABLED = "1";
  // Make sure a secret exists before the first session is signed.
  ensureSessionSecret();
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function issueSession(user: User): Promise<void> {
  const token = await signSession(
    {
      userId: user.id,
      expiresAt: Date.now() + SESSION_TTL_MS,
      fingerprint: await userFingerprint(user.passwordHash, user.active),
    },
    ensureSessionSecret(),
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    // Secure only when the request actually arrived over HTTPS. Not
    // hardcoded true: plenty of self-hosted installs run on plain http
    // over a LAN, and a Secure cookie is simply never sent back there —
    // the user would log in, get bounced to the login page, and have
    // nothing in the logs to explain it. Matches the existing
    // APP_PASSWORD login route's behaviour.
    secure: await isHttps(),
  });
}

async function isHttps(): Promise<boolean> {
  if (process.env.SEO_COOKIE_SECURE === "1") return true;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    if (proto) return proto.split(",")[0].trim() === "https";
  } catch {
    // Outside a request scope.
  }
  return false;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * The current user, or null.
 *
 * This is where the edge check gets its teeth: middleware proved the
 * cookie was authentic, this proves the user still exists, is still
 * active, and hasn't changed their password since the token was issued.
 */
export async function currentUser(): Promise<User | null> {
  if (!accountsEnabled()) return null;

  const jar = await cookies();
  const claims = await verifySession(
    jar.get(SESSION_COOKIE)?.value,
    ensureSessionSecret(),
  );
  if (!claims) return null;

  const user = db.select().from(users).where(eq(users.id, claims.userId)).get();
  if (!user || !user.active) return null;

  // Password changed or account deactivated since this token was signed
  // → the token is stale. This is the revocation path stateless sessions
  // would otherwise lack.
  const fp = await userFingerprint(user.passwordHash, user.active);
  if (fp !== claims.fingerprint) return null;

  return user;
}

/**
 * The signed-in user's id, or null — and never throws.
 *
 * For attribution at write time. The callers are helpers like
 * `logActivity` and `saveToolRun`, which also run from the background
 * scheduler where there is no request and `cookies()` throws. An
 * activity log that can take down a rank check is worse than one that
 * occasionally records "nobody", which is the honest answer for work the
 * scheduler did anyway.
 */
export async function currentUserId(): Promise<number | null> {
  try {
    const user = await currentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  member: "Member",
  viewer: "Client viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner:
    "Full control — all clients, team management, integrations, billing settings.",
  manager:
    "All clients and all work, but can't add or remove people or change integration keys.",
  member: "Only the clients they're assigned to. Can do the work, not the admin.",
  viewer: "Read-only on assigned clients. For a client contact who wants to watch progress.",
};

/** Owners and managers see every client; members and viewers see assignments. */
export function seesAllClients(role: Role): boolean {
  return role === "owner" || role === "manager";
}

export function canManageTeam(role: Role): boolean {
  return role === "owner";
}

/** Anything destructive or account-wide: API keys, integrations, deleting clients. */
export function canManageSettings(role: Role): boolean {
  return role === "owner";
}

/** Can they change anything at all, or are they here to look? */
export function canEdit(role: Role): boolean {
  return role !== "viewer";
}

/**
 * The client ids a user may see, or `null` meaning "no restriction".
 *
 * Returning null rather than "every id" is deliberate: callers can then
 * skip the filter entirely for owners and managers, which is both faster
 * and avoids a 500-client IN clause on an agency install.
 */
export async function visibleClientIds(
  user: User | null,
): Promise<number[] | null> {
  if (!user) return null; // solo mode — everything is visible
  if (seesAllClients(user.role)) return null;
  const rows = db
    .select({ clientId: clientMembers.clientId })
    .from(clientMembers)
    .where(eq(clientMembers.userId, user.id))
    .all();
  return rows.map((r) => r.clientId);
}

export async function canSeeClient(
  user: User | null,
  clientId: number,
): Promise<boolean> {
  if (!user) return true;
  if (seesAllClients(user.role)) return true;
  const row = db
    .select({ clientId: clientMembers.clientId })
    .from(clientMembers)
    .where(
      and(
        eq(clientMembers.userId, user.id),
        eq(clientMembers.clientId, clientId),
      ),
    )
    .get();
  return row != null;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

/**
 * Creates an account. The first one is always the owner — that's what
 * makes accounts opt-in without a separate setup step: whoever gets
 * there first on a fresh install owns it, and after that registration is
 * closed and new people arrive by invitation.
 */
export async function registerUser(input: {
  email: string;
  password: string;
  name?: string;
  role?: Role;
  /** Set by the invite flow; ignored for the first user, who is always owner. */
  allowWhenAccountsExist?: boolean;
}): Promise<RegisterResult> {
  const email = normaliseEmail(input.email);
  if (!email.includes("@") || email.length < 3) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const pwProblem = passwordProblem(input.password);
  if (pwProblem) return { ok: false, error: pwProblem };

  const isFirst = !accountsEnabled();
  if (!isFirst && !input.allowWhenAccountsExist) {
    return {
      ok: false,
      error:
        "This instance already has accounts. Ask the owner for an invite link.",
    };
  }

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .get();
  if (existing) {
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(input.password);
  const role: Role = isFirst ? "owner" : (input.role ?? "member");

  const created = db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: input.name?.trim() || null,
      role,
      active: true,
    })
    .returning()
    .get();

  markAccountsEnabled();
  return { ok: true, user: created };
}

export type LoginResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export async function authenticate(
  email: string,
  password: string,
): Promise<LoginResult> {
  const normalised = normaliseEmail(email);
  const user = db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalised}`)
    .get();

  // Same message and roughly the same work for "no such user" and "wrong
  // password", so the form can't be used to enumerate who has an account.
  if (!user) {
    await hashPassword(password);
    return { ok: false, error: "Email or password is incorrect." };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: "Email or password is incorrect." };
  }
  if (!user.active) {
    return {
      ok: false,
      error: "That account has been deactivated. Ask the owner to re-enable it.",
    };
  }

  db.update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .run();

  return { ok: true, user };
}
