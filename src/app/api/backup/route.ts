/**
 * Full backup endpoint. GET → streams the entire data.db file as a
 * download. Single-file backup is the whole point of SQLite — every
 * client, task, audit, keyword, ranking, report, tool run, AI chat,
 * error log, integration credential lives in this one file.
 *
 * The file is opened read-only and streamed in 64 KB chunks so it
 * doesn't pin the database for the duration.
 */

import { createReadStream, statSync, existsSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { guardAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dbPath(): string {
  return process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
}

export async function GET(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  const p = dbPath();
  if (!existsSync(p)) {
    return Response.json(
      { ok: false, error: "data.db not found" },
      { status: 404 },
    );
  }

  let bytes: number;
  try {
    bytes = statSync(p).size;
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }

  // Format yyyy-mm-dd_hhmm for a tidy filename.
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `seo-tool-backup-${stamp}.db`;

  const nodeStream = createReadStream(p, { highWaterMark: 64 * 1024 });
  // Convert Node Readable to a Web ReadableStream for Response()
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<
    Uint8Array
  >;

  return new Response(webStream, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(bytes),
      "cache-control": "no-store",
    },
  });
}
