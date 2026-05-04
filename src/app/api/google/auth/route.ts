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
  const clientId = req.nextUrl.searchParams.get("clientId");
  // State encodes both popup mode and target clientId so the callback
  // knows where to store the resulting tokens. Format: "popup|clientId:123"
  const stateParts: string[] = [];
  if (popup) stateParts.push("popup");
  if (clientId && /^\d+$/.test(clientId)) {
    stateParts.push(`clientId:${clientId}`);
  }
  const url = buildAuthUrl({
    clientId: creds.clientId,
    redirectUri,
    state: stateParts.length > 0 ? stateParts.join("|") : undefined,
  });
  return NextResponse.redirect(url);
}
