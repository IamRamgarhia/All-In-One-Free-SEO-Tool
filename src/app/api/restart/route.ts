/**
 * Restart the local server on the SAME port it's currently bound to.
 *
 * Port detection: we read the request's Host header (set by the browser
 * to whatever port the user is talking to us on) so the new instance
 * comes up on that same port — no surprise tab switching for the user.
 *
 * Spawning: detached child invokes seo.cmd / seo.sh with PORT + the
 * SEO_RESTART=1 flag (which tells the launcher to skip re-opening a
 * browser tab — the existing tab will reload itself via /api/health-ping).
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { detectPortFromRequest, rememberPort } from "@/lib/port-memory";
import { guardAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
// Required: uses node:child_process + node:fs — Edge runtime can't load these.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  if (process.env.RUNNING_IN_DOCKER === "1") {
    return Response.json(
      {
        ok: false,
        error:
          "Inside Docker — restart with `docker compose restart` on the host.",
      },
      { status: 400 },
    );
  }

  const cwd = process.cwd();
  const isWin = process.platform === "win32";
  const launcher = path.join(cwd, isWin ? "seo.cmd" : "seo.sh");

  if (!existsSync(launcher)) {
    return Response.json(
      {
        ok: false,
        error:
          "Launcher script not found. Update to the latest version, then try again.",
      },
      { status: 500 },
    );
  }

  const port = detectPortFromRequest(req);
  // Persist so the desktop shortcut + any future cold-start uses this port too
  await rememberPort(port).catch(() => undefined);

  // Fire-and-forget: kick off the detached relaunch on a delay long
  // enough for this response to flush, then exit ourselves.
  setTimeout(() => {
    try {
      const env = {
        ...process.env,
        PORT: port,
        SEO_RESTART: "1",
      };
      const child = isWin
        ? spawn("cmd.exe", ["/c", "start", "", "/min", launcher], {
            cwd,
            env,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          })
        : spawn("sh", [launcher], {
            cwd,
            env,
            detached: true,
            stdio: "ignore",
          });
      child.unref();
    } catch {
      // ignore — process.exit still fires below
    }
    setTimeout(() => process.exit(0), 500);
  }, 250);

  return Response.json({
    ok: true,
    port,
    message: `Restarting on port ${port}. The page will reload itself in 8–15 seconds once the server is back.`,
  });
}
