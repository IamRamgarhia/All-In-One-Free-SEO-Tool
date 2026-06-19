/**
 * Full backup endpoint. GET → takes an online consistent snapshot via
 * SQLite's VACUUM INTO and streams it as a download. Single-file
 * backup is the whole point of SQLite — every client, task, audit,
 * keyword, ranking, report, tool run, AI chat, error log, integration
 * credential lives in this one file.
 *
 * Why VACUUM INTO instead of streaming data.db directly: better-sqlite3
 * runs in WAL mode by default, so the live data.db file is missing
 * any uncommitted pages still in the -wal file. A naive stream of
 * data.db produces a logically incomplete backup; VACUUM INTO writes a
 * fresh, fully-checkpointed copy that the user can restore from
 * cleanly. tickAutoBackup uses the same approach.
 *
 * The snapshot is written to a temp file inside the data dir (same
 * filesystem so the rename + cleanup is cheap), streamed to the
 * client, then unlinked.
 */

import {
  createReadStream,
  statSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import Database from "better-sqlite3";
import { guardAdminRequest } from "@/lib/admin-auth";
import { dataDir } from "@/lib/data-dir";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dbPath(): string {
  return process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
}

export async function GET(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  const src = dbPath();
  if (!existsSync(src)) {
    return Response.json(
      { ok: false, error: "data.db not found" },
      { status: 404 },
    );
  }

  // Format yyyy-mm-dd_hhmm for a tidy filename.
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filename = `seo-tool-backup-${stamp}.db`;

  // Take an online consistent snapshot via VACUUM INTO. Single-quote
  // safe-escaping for the path — same approach as auto-backup.ts.
  // The temp file lands in the data dir so it's on the same filesystem
  // (no cross-device copy) and gets pruned in the finally block whether
  // streaming succeeds or fails.
  const dir = dataDir();
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort — usually exists
  }
  const tempName = `data.db.download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  const tempPath = path.join(dir, tempName);

  let snapshotBytes = 0;
  try {
    const sqlite = new Database(src, { readonly: true });
    try {
      sqlite.exec(`VACUUM INTO '${tempPath.replace(/'/g, "''")}'`);
    } finally {
      sqlite.close();
    }
    snapshotBytes = statSync(tempPath).size;
  } catch (err) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    return Response.json(
      {
        ok: false,
        error: `Snapshot failed: ${(err as Error).message}`,
      },
      { status: 500 },
    );
  }

  const nodeStream = createReadStream(tempPath, { highWaterMark: 64 * 1024 });
  // Best-effort cleanup once the stream finishes (success or error).
  nodeStream.on("close", () => {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  });
  nodeStream.on("error", () => {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
  });

  // Convert Node Readable to a Web ReadableStream for Response()
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<
    Uint8Array
  >;

  return new Response(webStream, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(snapshotBytes),
      "cache-control": "no-store",
    },
  });
}
