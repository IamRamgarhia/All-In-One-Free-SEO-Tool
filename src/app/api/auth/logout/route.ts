import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";

export const dynamic = "force-dynamic";

/**
 * Clears both cookies unconditionally. Which one is actually in use
 * depends on the install's auth mode, and signing out should not require
 * knowing that — clearing a cookie that isn't set costs nothing.
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  for (const name of ["stb_auth", SESSION_COOKIE]) {
    res.cookies.set({
      name,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
