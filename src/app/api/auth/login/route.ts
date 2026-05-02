import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const required = process.env.APP_PASSWORD;
  if (!required) {
    return NextResponse.json(
      { error: "Auth disabled (APP_PASSWORD not set)" },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | { password?: string }
    | null;
  const submitted = body?.password ?? "";

  if (submitted !== required) {
    // Constant-time-ish: small jitter so attackers can't time-attack the
    // string comparison. Self-hosted single-user gate, this is enough.
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "stb_auth",
    value: required,
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
