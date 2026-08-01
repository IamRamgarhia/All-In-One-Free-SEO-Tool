import { NextResponse } from "next/server";
import { accountsEnabled, issueSession, registerUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/invites";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Creates an account, in exactly two situations:
 *
 *   - no accounts exist yet → whoever registers becomes the owner
 *   - a valid invite token is presented → they get the invited role
 *
 * Anything else is refused. Without that rule this endpoint would be an
 * open door on every deployed instance, since it has to be reachable
 * without a session to be usable at all.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    name?: string;
    token?: string;
  } | null;

  const password = body?.password ?? "";

  if (body?.token) {
    const result = await acceptInvite({
      token: body.token,
      password,
      name: body.name,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const user = db.select().from(users).where(eq(users.id, result.userId)).get();
    if (user) await issueSession(user);
    return NextResponse.json({ ok: true });
  }

  if (accountsEnabled()) {
    return NextResponse.json(
      {
        error:
          "This instance already has accounts. Ask the owner for an invite link.",
      },
      { status: 403 },
    );
  }

  const result = await registerUser({
    email: body?.email ?? "",
    password,
    name: body?.name,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await issueSession(result.user);
  return NextResponse.json({ ok: true });
}
