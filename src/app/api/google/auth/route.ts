import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthUrl,
  getGoogleClientCredentials,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const creds = await getGoogleClientCredentials();
  if (!creds) {
    return NextResponse.redirect(
      new URL(
        "/settings/google?error=no-credentials",
        req.nextUrl.origin,
      ),
    );
  }
  const redirectUri = new URL(
    "/api/google/callback",
    req.nextUrl.origin,
  ).toString();

  const popup = req.nextUrl.searchParams.get("popup") === "1";
  const url = buildAuthUrl({
    clientId: creds.clientId,
    redirectUri,
    state: popup ? "popup" : undefined,
  });
  return NextResponse.redirect(url);
}
