/**
 * Cleanly stop the local server. Browser becomes unreachable — the user
 * relaunches via the desktop / Start Menu shortcut or by running seo.cmd.
 */

import { guardAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  if (process.env.RUNNING_IN_DOCKER === "1") {
    return Response.json(
      {
        ok: false,
        error:
          "Inside Docker — stop with `docker compose down` on the host.",
      },
      { status: 400 },
    );
  }

  // Let the response flush before we kill ourselves.
  setTimeout(() => process.exit(0), 400);

  return Response.json({
    ok: true,
    message:
      "Server stopping. Open the desktop shortcut or run seo.cmd to start it again.",
  });
}
