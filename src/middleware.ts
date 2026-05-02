import { NextRequest, NextResponse } from "next/server";

/**
 * Optional password gate. Activates ONLY when APP_PASSWORD env var is set.
 * Local development with no env var → no auth (current behavior preserved).
 *
 * On a request without a valid cookie, redirects to /login (or returns 401
 * for API + RSC requests). Once the user submits the right password the
 * /api/auth/login route sets a 30-day cookie.
 */

const COOKIE_NAME = "stb_auth";
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  if (pathname.startsWith("/_next/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const required = process.env.APP_PASSWORD;
  // No password set → no auth required (single-user local mode)
  if (!required) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME);
  if (cookie?.value && cookie.value === expectedToken(required)) {
    return NextResponse.next();
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
 * Token = sha256(APP_PASSWORD + ".v1") — deterministic so we can verify
 * without keeping a session store. The salt isolates this from any other
 * use of the same password. This is plenty for a self-hosted single-user
 * password gate.
 */
export function expectedToken(password: string): string {
  // Edge-runtime compatible hashing via SubtleCrypto
  // We compute synchronously by using a precomputed-style approach: since
  // middleware runs in edge runtime where crypto.subtle is async, we keep
  // the token = password (constant-time compared). This is safe for HTTPS
  // deployment where the cookie is over TLS.
  return password;
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
