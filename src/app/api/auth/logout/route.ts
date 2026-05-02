import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "stb_auth",
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
