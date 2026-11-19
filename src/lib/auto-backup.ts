/**
 * Daily auto-backup tick.
 *
 * Why: data.db holds everything (clients, audits, keywords, AI logs,
 * encrypted API keys). The Backup & restore UI exists but only runs
 * when the user clicks Download. Users forget. A single Docker prune,
 * partial disk write, or accidental rm can erase months of work.
 *
 * What this does:
 *   - On each tick (called from the dashboard alongside the other tick
 *     runners), check if the last auto-backup is older than the
 *     configured cadence (default 24h).
 *   - If yes, take an online consistent snapshot via SQLite's
 *     `VACUUM INTO` — works while the DB is open, doesn't lock writers.
 *   - Write to <dataDir>/data.db.bak-<ISO-timestamp>
 *   - Prune older backups beyond the retention count (default 7 most
 *     recent).
 *   - Update settings to record last-run + last-bytes.
 *
 * What this does NOT do:
 *   - Off-site replication. Users wanting that should also configure
 *     a separate file-sync solution (Syncthing, Restic, Borg, etc.).
 *     The backups produced here are still single-disk; if the disk
 *     dies, both DB and backups are gone.
 *   - Encrypted backups. The .seo-encryption-key file is what
 *     decrypts the credentials inside the DB; users should back BOTH
 *     up off-site. The auto-backup creates a .bak file that's just
 *     a normal SQLite file the user can copy elsewhere.
 *
 * Settings:
 *   - autobackup.enabled (default true)
 *   - autobackup.cadence_hours (default 24)
 *   - autobackup.retention (default 7 — one week of daily backups)
 *   - autobackup.last_run_at (managed by this module)
 *   - autobackup.last_bytes (managed by this module)
 *   - autobackup.last_error (managed by this module)
 */

import path from "node:path";
import { existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import { backupDir } from "./data-dir";
import { getSetting, setSetting } from "./settings-store";

const DEFAULT_CADENCE_HOURS = 24;
const DEFAULT_RETENTION = 7;
const HOUR_MS = 60 * 60 * 1000;

function dbPath(): string {
  return process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
}

/**
 * Idempotent — safe to call on every dashboard hit. Returns silently
 * when nothing is due. Returns silently on any error too, after
 * recording it in autobackup.last_error so the Backup page can
 * surface what went wrong.
 */
let inFlight = false;

/**
 * When this process last took a backup, independent of the database.
 *
 * The persisted `autobackup.last_run_at` is the real record and
 * survives restarts; this only covers the case where writing it fails,
 * which on a database with no schema is every time. Without it the
 * cadence depends on a write to the file being backed up.
 */
let lastRunInProcess: number | null = null;
export async function tickAutoBackup(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const enabled = await getSetting<boolean>("autobackup.enabled");
    // Default ON — users who want it off must explicitly disable.
    if (enabled === false) return;

    const cadenceHoursRaw = await getSetting<number>("autobackup.cadence_hours");
    const cadenceMs =
      (typeof cadenceHoursRaw === "number" && cadenceHoursRaw > 0
        ? cadenceHoursRaw
        : DEFAULT_CADENCE_HOURS) * HOUR_MS;

    const lastRunIso = await getSetting<string>("autobackup.last_run_at");
    if (lastRunIso) {
      const last = new Date(lastRunIso);
      if (Date.now() - last.getTime() < cadenceMs) return;
    }

    // The in-process guard, for when the DATABASE cannot remember.
    //
    // `autobackup.last_run_at` is stored in the settings table, so the
    // "have I run recently?" answer depends on a write to the very
    // database being backed up. When that write cannot land, every tick
    // reads "never" and takes another backup.
    //
    // MEASURED on a fresh Windows install whose migrations had not run:
    // seven backups of a 4 KB empty database in three minutes, one per
    // scheduler tick, filling the data directory for as long as the app
    // stayed open. Nothing errored — it is bookkeeping failing silently
    // and the work repeating because of it.
    //
    // Fixing the migrations stops THAT cause. This stops the behaviour:
    // a backup whose record could not be written must back off rather
    // than spin, whatever made the write fail.
    if (lastRunInProcess !== null && Date.now() - lastRunInProcess < cadenceMs) {
      return;
    }

    const src = dbPath();
    if (!existsSync(src)) return;

    // Not the data directory. On a native install that is the app
    // folder, so every backup sat inside the folder most likely to be
    // deleted, moved or overwritten — including by this app's own zip
    // updater. See scripts/backup-dir.mjs.
    //
    // Pruning below therefore applies to the NEW directory only.
    // Backups already in the old one are left alone: they are bounded
    // (no new ones land there), and quietly deleting someone's existing
    // backups during an update is the opposite of what this is for.
    const dir = backupDir();
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // best-effort
    }

    // ISO timestamp without colons (Windows filename safety): 2026-05-21T07-30-00Z
    const stamp = new Date()
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\..+$/, "Z");
    const dbName = path.basename(src);
    const target = path.join(dir, `${dbName}.bak-${stamp}`);

    // Use SQLite's VACUUM INTO for a consistent online snapshot.
    // Equivalent to .backup but doesn't require holding both
    // connections — VACUUM INTO atomically writes the target file.
    const sqlite = new Database(src, { readonly: true });
    try {
      sqlite.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    } finally {
      sqlite.close();
    }

    const stat = statSync(target);

    // Recorded the moment the file exists, BEFORE the settings write
    // below — which is the write that cannot land when the schema is
    // missing, and the whole reason this guard exists.
    lastRunInProcess = Date.now();

    // Prune old backups beyond retention
    const retentionRaw = await getSetting<number>("autobackup.retention");
    const retention =
      typeof retentionRaw === "number" && retentionRaw > 0
        ? retentionRaw
        : DEFAULT_RETENTION;
    pruneOldBackups(dir, dbName, retention);

    await setSetting("autobackup.last_run_at", new Date().toISOString());
    await setSetting("autobackup.last_bytes", stat.size);
    await setSetting("autobackup.last_error", "");
  } catch (err) {
    try {
      await setSetting(
        "autobackup.last_error",
        (err as Error).message ?? "unknown",
      );
    } catch {
      // settings store unwritable — nothing else to do
    }
  } finally {
    inFlight = false;
  }
}

function pruneOldBackups(
  dir: string,
  dbName: string,
  keep: number,
): void {
  try {
    const all = readdirSync(dir)
      .filter((f) => f.startsWith(`${dbName}.bak-`))
      .map((f) => {
        const fp = path.join(dir, f);
        try {
          return { fp, mtime: statSync(fp).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((x): x is { fp: string; mtime: number } => x !== null)
      .sort((a, b) => b.mtime - a.mtime);
    // Keep `keep` most recent; delete the rest
    for (let i = keep; i < all.length; i++) {
      try {
        unlinkSync(all[i].fp);
      } catch {
        // best-effort — file may already be gone
      }
    }
  } catch {
    // best-effort
  }
}
