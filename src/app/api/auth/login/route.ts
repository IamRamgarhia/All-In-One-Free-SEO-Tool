import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/secure-compare";

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

  if (!timingSafeEqual(submitted, required)) {
    // Small jitter on top of the constant-time compare — defense in depth
    // against any timing inference at the network layer.
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
