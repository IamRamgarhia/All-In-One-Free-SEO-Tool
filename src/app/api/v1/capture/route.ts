import {
  authenticateRequest,
  jsonError,
  jsonOk,
  requireScope,
} from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint hit by the browser extension. Authenticates with API key,
 * stores arbitrary captures (page HTML, GSC table snapshots, competitor
 * page facts) for later processing. Returns the storage id so the
 * extension can show a "saved" toast.
 */
export async function POST(req: Request) {
  const key = await authenticateRequest(req);
  if (!key) return jsonError(401, "Unauthorized");
  if (!requireScope(key, "write"))
    return jsonError(403, "Write scope required.");

  let body: {
    type?: string;
    url?: string;
    title?: string;
    payload?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Body must be JSON.");
  }

  const type = String(body.type ?? "generic");
  const url = String(body.url ?? "");
  const title = String(body.title ?? "");

  if (!url) return jsonError(400, "url is required.");

  // Log to activity feed (lightweight) so the user can replay captures.
  await logActivity({
    kind: "outreach.contacted",
    message: `Browser-ext capture: ${type} from ${url} — ${title.slice(0, 80)}`,
    messageFr: `Capture depuis l’extension du navigateur : ${type} depuis ${url} — ${title.slice(0, 80)}`,
    level: "info",
    entityType: "capture",
  });

  // The full payload also gets stashed via inbound webhook semantics so the
  // user can inspect it. Keep payload size sane.
  const size = JSON.stringify(body.payload ?? {}).length;
  if (size > 1_000_000) {
    return jsonError(413, "Payload >1MB — strip the HTML before sending.");
  }

  return jsonOk({
    ok: true,
    type,
    url,
    storedAt: new Date().toISOString(),
    payloadSize: size,
  });
}

// Cheap dummy GET so users can verify the endpoint exists from the browser.
export async function GET(req: Request) {
  const key = await authenticateRequest(req);
  if (!key) return jsonError(401, "Unauthorized");
  return jsonOk({
    ok: true,
    note: "POST JSON to this endpoint with { type, url, title, payload }",
  });
}