/**
 * Defensive guard for admin endpoints that take destructive actions:
 *   /api/restart   — stops the running server
 *   /api/shutdown  — same
 *   /api/restore   — replaces data.db with an uploaded file
 *   /api/backup    — exports the entire database
 *   /api/update    — runs `git pull` + `pnpm install`
 *   /api/desktop-shortcut — spawns PowerShell
 *
 * Middleware already protects these when APP_PASSWORD is set. But when
 * a user runs the app without a password on a LAN-reachable port, ANY
 * device on the network could hit these endpoints. This guard adds a
 * second line of defense:
 *
 *   - When APP_PASSWORD is set, middleware handles it — we no-op here.
 *   - When APP_PASSWORD is NOT set, we require the request to come
 *     from localhost. Anything else is denied with 403.
 *
 * Returns null when the request is allowed. Returns a Response when
 * denied — caller should `return` it immediately.
 */

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
  "0.0.0.0",
]);

function isLocalRequest(req: Request): boolean {
  // Prefer the Host header (what the user actually typed in the
  // browser); fall back to the URL itself.
  const hostHeader = req.headers.get("host") ?? "";
  const hostname = hostHeader.split(":")[0].toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) return true;

  // Some clients (curl, scripts) won't set Host — check the request URL
  try {
    const url = new URL(req.url);
    return LOCAL_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function guardAdminRequest(req: Request): Response | null {
  // If a password is configured, middleware already validated the cookie
  // before this route was reached — we don't need to re-check.
  if (process.env.APP_PASSWORD) return null;

  // Without a password, restrict admin actions to same-machine callers
  if (isLocalRequest(req)) return null;

  return Response.json(
    {
      ok: false,
      error:
        "This action is restricted to local-machine requests. Set the APP_PASSWORD environment variable to enable remote access.",
    },
    { status: 403 },
  );
}
