import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "@/lib/secure-compare";

/**
 * Optional password gate. Activates ONLY when APP_PASSWORD env var is set.
 * Local development with no env var → no auth (current behavior preserved).
 *
 * On a request without a valid cookie, redirects to /login (or returns 401
 * for API + RSC requests). Once the user submits the right password the
 * /api/auth/login route sets a 30-day cookie.
 */

const COOKIE_NAME = "stb_auth";

/**
 * Paths the password gate must NOT cover.
 *
 * Everything below carries its own authentication (a share token, an
 * API key, a webhook token) or is meant to be reachable by someone who
 * will never have the workspace password. Gating them behind the cookie
 * broke the exact features that only matter once APP_PASSWORD is set —
 * i.e. every real deployment:
 *
 *   /portal/[token]      client magic-links showed clients a login wall
 *   /api/v1/*            the public API 401'd valid Bearer keys, because
 *                        middleware only ever checked the cookie
 *   /api/webhooks/[token] inbound webhooks were rejected outright
 *   /api/v1/health       the HTA launcher and START scripts poll this to
 *                        decide whether the server came up
 *
 * These are not unauthenticated: api-auth.ts hashes and checks the
 * Bearer key, the portal requires a 16+ char unguessable share token,
 * and webhook routes match on their own token. The password gate was a
 * second, incompatible auth scheme layered on top.
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
  // Short-link redirector — must be public so external visitors clicking
  // the link reach the destination without hitting the auth gate.
  "/r",
  // Client portal. Authenticated by the per-client share token in the
  // path; the client has no workspace password and never will.
  "/portal",
  // Public API. Authenticated by `Authorization: Bearer seo_live_...`
  // in api-auth.ts — a different scheme from the browser cookie.
  "/api/v1",
  // Inbound webhooks. Authenticated by the token in the path.
  "/api/webhooks",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (pathname.startsWith("/_next/")) return true;
  return false;
}

/**
 * Read `?embed=1` once at the edge and forward the bit to the rest of
 * the request as an `x-embed` request header. The root layout reads
 * that header via `next/headers` and skips rendering the shell chrome
 * — that's how the per-client tool drawer loads tools cleanly in an
 * iframe without duplicating the app's sidebar / top bar / floating
 * widgets.
 *
 * Doing this here (server-side) instead of via a client useEffect
 * avoids the "flash of full shell" the iframe used to show before
 * hydration caught up.
 */
function applyEmbedHeader(req: NextRequest): Headers {
  const requestHeaders = new Headers(req.headers);
  if (req.nextUrl.searchParams.get("embed") === "1") {
    requestHeaders.set("x-embed", "1");
  }
  return requestHeaders;
}

export async function middleware(req: NextRequest) {
  const requestHeaders = applyEmbedHeader(req);
  const passthrough = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  const required = process.env.APP_PASSWORD;
  // No password set → no auth required (single-user local mode).
  // Still forward the x-embed header so the layout sees it.
  if (!required) return passthrough();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return passthrough();

  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value) {
    const expected = await expectedToken(required);
    if (timingSafeEqual(cookie.value, expected)) {
      return passthrough();
    }
  }

  // Browser-style request → redirect to /login
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return new NextResponse(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Token = SHA-256(APP_PASSWORD + ".v1") expressed as 64-char hex.
 *
 * The cookie value is the HASH, never the raw password. If the cookie
 * ever leaks (XSS, network sniff, dumped logs), the attacker has to
 * crack a SHA-256 to recover APP_PASSWORD — not a free read.
 *
 * Edge runtime: crypto.subtle.digest is async, hence this helper is
 * async. Middleware now awaits it; the login route does the same.
 */
export async function expectedToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}.v1`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     *  - /_next/static (static assets)
     *  - /_next/image (image optimization)
     *  - any file with an extension (.png, .jpg, etc.)
     */
    "/((?!_next/static|_next/image|.*\\..*).*)",
  ],
};
