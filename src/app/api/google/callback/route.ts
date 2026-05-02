import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
  getGoogleClientCredentials,
} from "@/lib/google-oauth";
import { setSetting } from "@/lib/settings-store";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const isPopup = req.nextUrl.searchParams.get("state") === "popup";

  const settingsUrl = new URL("/settings/google", req.nextUrl.origin);

  function popupResponse(payload: {
    ok: boolean;
    email?: string | null;
    error?: string;
  }) {
    // Render a tiny HTML page that postMessages the parent and closes itself.
    const safe = JSON.stringify(payload).replace(/</g, "\\u003c");
    return new NextResponse(
      `<!doctype html><html><head><meta charset="utf-8"><title>Google ${
        payload.ok ? "connected" : "connection failed"
      }</title></head><body style="background:#0c0d12;color:#fff;font-family:system-ui,sans-serif;padding:24px;text-align:center"><p>${
        payload.ok
          ? "Connected. You can close this window."
          : "Connection failed: " + (payload.error ?? "unknown")
      }</p><script>(function(){try{if(window.opener){window.opener.postMessage(${safe},"*");}}catch(e){}setTimeout(function(){window.close();},400);})();</script></body></html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  if (error) {
    if (isPopup) return popupResponse({ ok: false, error });
    settingsUrl.searchParams.set("error", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code) {
    if (isPopup) return popupResponse({ ok: false, error: "missing-code" });
    settingsUrl.searchParams.set("error", "missing-code");
    return NextResponse.redirect(settingsUrl);
  }

  const creds = await getGoogleClientCredentials();
  if (!creds) {
    if (isPopup) return popupResponse({ ok: false, error: "no-credentials" });
    settingsUrl.searchParams.set("error", "no-credentials");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = new URL(
    "/api/google/callback",
    req.nextUrl.origin,
  ).toString();

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri,
    });
  } catch (err) {
    const msg = `exchange-failed: ${(err as Error).message}`;
    if (isPopup) return popupResponse({ ok: false, error: msg });
    settingsUrl.searchParams.set("error", msg);
    return NextResponse.redirect(settingsUrl);
  }

  if (!tokens.refresh_token) {
    const msg =
      "no-refresh-token: revoke this app's access at https://myaccount.google.com/permissions and try again";
    if (isPopup) return popupResponse({ ok: false, error: msg });
    settingsUrl.searchParams.set("error", msg);
    return NextResponse.redirect(settingsUrl);
  }

  // Persist tokens
  await Promise.all([
    setSetting("google.refresh_token", tokens.refresh_token),
    setSetting("google.access_token", tokens.access_token),
    setSetting(
      "google.access_token_expires_at",
      Date.now() + tokens.expires_in * 1000,
    ),
  ]);

  // Best-effort email lookup so we can show "Connected as foo@gmail.com"
  let email: string | null = null;
  try {
    email = await fetchGoogleUserEmail(tokens.access_token);
    if (email) await setSetting("google.connected_email", email);
  } catch {
    // ignore
  }

  await logActivity({
    kind: "google.connected",
    message: `Connected Google account${email ? ` (${email})` : ""} for GSC + GA4 access.`,
    level: "success",
  });

  if (isPopup) return popupResponse({ ok: true, email });
  settingsUrl.searchParams.set("connected", "1");
  return NextResponse.redirect(settingsUrl);
}
