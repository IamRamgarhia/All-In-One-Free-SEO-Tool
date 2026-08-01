import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/secure-compare";
import { expectedToken } from "@/middleware";
import { accountsEnabled, authenticate, issueSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Two login modes behind one endpoint, because which one applies is a
 * property of the install, not of the request: if accounts exist we want
 * an email and a password, otherwise this is the original shared-password
 * mode and we want just a password.
 *
 * Accounts take precedence deliberately. Once an agency has real users, a
 * still-set APP_PASSWORD must not remain a back door around them — and it
 * usually IS still set, because that's how the instance was deployed
 * before anyone registered.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { password?: string; email?: string }
    | null;
  const submitted = body?.password ?? "";

  if (accountsEnabled()) {
    const email = body?.email ?? "";
    if (!email) {
      return NextResponse.json(
        { error: "Enter your email address." },
        { status: 400 },
      );
    }
    const result = await authenticate(email, submitted);
    if (!result.ok) {
      // Same jitter as below — a fast "no such user" next to a slow
      // "wrong password" is exactly how account enumeration works.
      await new Promise((r) => setTimeout(r, 250));
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    await issueSession(result.user);
    return NextResponse.json({
      ok: true,
      user: {
        id: result.user.id,
        name: result.user.name,
        role: result.user.role,
      },
    });
  }

  const required = process.env.APP_PASSWORD;
  if (!required) {
    return NextResponse.json(
      { error: "Auth disabled (APP_PASSWORD not set)" },
      { status: 400 },
    );
  }

  if (!timingSafeEqual(submitted, required)) {
    // Small jitter on top of the constant-time compare — defense in depth
    // against any timing inference at the network layer.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  // Cookie value is the hashed token, NEVER the raw password. If the
  // cookie leaks, the attacker has to crack SHA-256 to recover the
  // password — not a free read.
  const token = await expectedToken(required);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "stb_auth",
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
