import { NextResponse } from "next/server";
import { canManageTeam, currentUser } from "@/lib/auth";
import { createInvite } from "@/lib/invites";
import type { Role } from "@/db/schema";

export const dynamic = "force-dynamic";

const ROLES: Role[] = ["owner", "manager", "member", "viewer"];

/**
 * Create an invite link over HTTP.
 *
 * The team screen uses a server action, so this exists for the cases a
 * server action can't serve: onboarding a team from a script, and the
 * auth-flow check in scripts/auth-check.mjs, which has to drive the
 * whole invite → accept → scoped-access path without a browser.
 *
 * Same authorization as the server action — owner only, re-checked here
 * rather than assumed.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!canManageTeam(me.role)) {
    return NextResponse.json(
      { error: "Only the owner can invite people." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    role?: string;
  } | null;

  const role = ROLES.includes(body?.role as Role)
    ? (body!.role as Role)
    : "member";

  const created = await createInvite({
    email: body?.email ?? "",
    role,
    invitedBy: me.id,
  });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    email: created.result.invite.email,
    role,
    link: `/invite/${created.result.token}`,
    expiresAt: created.result.invite.expiresAt,
  });
}
