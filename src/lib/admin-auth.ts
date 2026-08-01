/**
 * Defensive guard for admin endpoints that take destructive actions:
 *   /api/restart   — stops the running server
 *   /api/shutdown  — same
 *   /api/restore   — replaces data.db with an uploaded file
 *   /api/backup    — exports the entire database
 *   /api/update    — runs `git pull` + `pnpm install`
 *   /api/desktop-shortcut — spawns PowerShell
 *   /api/report-archives/[id]/pdf  — exports report PDFs
 *   /api/clients/[id]/skip-branding — mutates client config
 *
 * Two-layer protection:
 *
 *   Layer 1 — socket binding. Daily launchers bind to 127.0.0.1 unless
 *     the user explicitly sets SEO_BIND_HOST=0.0.0.0. This means packets
 *     from LAN devices simply never reach the process. The cheapest, most
 *     reliable defense.
 *
 *   Layer 2 — this guard. Even if the socket is exposed (Docker, reverse
 *     proxy, deliberate LAN sharing), we re-check at the HTTP layer:
 *
 *     - If APP_PASSWORD is set, middleware has already validated the
 *       cookie — we no-op.
 *     - Otherwise, we trust the FORWARDING headers first (x-forwarded-for,
 *       x-real-ip), NOT the Host header. The Host header is fully
 *       user-controlled (curl -H "Host: localhost") so trusting it for
 *       authorization is a known footgun.
 *     - Only fall back to Host as a last resort, when no forwarding
 *       header tells us the real remote address.
 */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "0.0.0.0",
]);

function isLocalIp(ip: string): boolean {
  if (!ip) return false;
  const trimmed = ip.replace(/^::ffff:/, "").trim(); // unwrap IPv4-mapped IPv6
  if (trimmed === "127.0.0.1" || trimmed === "::1") return true;
  if (trimmed === "localhost") return true;
  return false;
}

function isLocalRequest(req: Request): boolean {
  // 1. Forwarding headers ONLY trusted when TRUSTED_PROXY=1.
  //    Without a known reverse proxy, x-forwarded-for / x-real-ip are
  //    fully caller-controlled — any local process can `curl -H
  //    "x-forwarded-for: 127.0.0.1"` and bypass us. The default deploy
  //    binds to 127.0.0.1 (so only same-machine processes can reach
  //    the socket anyway), making the Host-header check below safe
  //    enough. Users running behind nginx / Caddy / Cloudflare set
  //    TRUSTED_PROXY=1 to opt into header trust.
  if (process.env.TRUSTED_PROXY === "1") {
    const fwdFor = req.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (fwdFor) return isLocalIp(fwdFor);

    const realIp = req.headers.get("x-real-ip")?.trim();
    if (realIp) return isLocalIp(realIp);
  }

  // 2. No (or untrusted) forwarding headers. We're either talking
  //    directly to the Next.js socket (which we've bound to 127.0.0.1,
  //    so by definition the request is local at the socket layer) or
  //    behind a proxy that didn't set forwarding headers. In both
  //    cases the Host header gives a weak signal — but ONLY when
  //    combined with the fact that the socket binding is local.
  const hostHeader = req.headers.get("host") ?? "";
  const hostname = hostHeader.split(":")[0].toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) return true;

  // 3. URL fallback — covers curl/scripts that don't send Host
  try {
    const url = new URL(req.url);
    return LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Reject cross-site requests.
 *
 * The origin check is the load-bearing one, not the IP check. Binding
 * to 127.0.0.1 stops LAN devices, but it does NOT stop the browser the
 * user is already running: any page they visit can issue
 *
 *     fetch('http://localhost:3000/api/update', {method:'POST', mode:'no-cors'})
 *
 * and that request arrives with `Host: localhost:3000`, passes
 * isLocalRequest(), and — for /api/update — force-resets the user's
 * working tree and runs `pnpm install` (arbitrary postinstall code).
 * /api/restore overwrites data.db; /api/shutdown kills the server.
 * There was no token, no Origin check, and no cookie to carry SameSite,
 * so nothing stood between a malicious page and those endpoints.
 *
 * Next.js applies its own origin verification to Server Actions, but
 * not to route handlers — these routes got none of it.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be spoofed by page
 * JavaScript, which is what makes it a valid CSRF defence. Non-browser
 * clients (curl, the launcher scripts) omit it entirely; we allow that,
 * since a caller who can run curl on the box can run the command
 * directly anyway. What we block is the browser-mediated path.
 */
function isCrossSiteRequest(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;

  // Older browsers predate Sec-Fetch-Site. Fall back to comparing
  // Origin against Host — a cross-site fetch always sends Origin.
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host");
    try {
      if (!host || new URL(origin).host !== host) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function guardAdminRequest(req: Request): Response | null {
  // Cross-site check runs FIRST and applies even when APP_PASSWORD is
  // set: the cookie is sent automatically on a cross-site POST, so a
  // password does not protect against CSRF on its own.
  if (isCrossSiteRequest(req)) {
    return Response.json(
      {
        ok: false,
        error:
          "Cross-site request blocked. Admin actions can only be triggered from the app itself.",
      },
      { status: 403 },
    );
  }

  // If a password is configured, middleware already validated the cookie
  // before this route was reached — we don't need to re-check.
  if (process.env.APP_PASSWORD) return null;

  // Without a password, restrict admin actions to same-machine callers.
  if (isLocalRequest(req)) return null;

  return Response.json(
    {
      ok: false,
      error:
        "This action is restricted to local-machine requests. Set APP_PASSWORD to enable authenticated remote access, or bind the server to 0.0.0.0 only on a trusted LAN.",
    },
    { status: 403 },
  );
}
