/**
 * Single source of truth for "where does user data live?".
 *
 * Resolution priority:
 *   1. SEO_DATA_DIR env var — explicit override (Docker uses /data)
 *   2. dirname(SEO_DB_PATH) — if the user set the DB path, data lives next to it
 *   3. process.cwd() — native install default (the install folder itself)
 *
 * This means a native install keeps everything in one folder (the install
 * directory). A Docker install keeps everything on the mounted volume.
 * Either way, "back up the data folder" is a complete backup.
 *
 * Files that live here:
 *   - data.db (+ data.db-wal, data.db-shm)
 *   - .seo-encryption-key (AES key for API keys / OAuth tokens)
 *   - .seo-port (last-bound port)
 *   - screenshots/ (SERP screenshots from rank checks)
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  backupSearchDirs as searchDirs,
  resolveBackupDir,
} from "../../scripts/backup-dir.mjs";

let cached: string | null = null;

export function dataDir(): string {
  if (cached) return cached;
  if (process.env.SEO_DATA_DIR) {
    cached = process.env.SEO_DATA_DIR;
    return cached;
  }
  if (process.env.SEO_DB_PATH) {
    cached = path.dirname(process.env.SEO_DB_PATH);
    return cached;
  }
  cached = process.cwd();
  return cached;
}

/**
 * Resolves a path inside the data folder, but falls back to a legacy
 * location at `process.cwd()/<name>` if (a) the new path doesn't exist
 * yet AND (b) the legacy path does. Used to keep older installs working
 * after the data-dir consolidation lands.
 */
/**
 * Where to WRITE a backup. See scripts/backup-dir.mjs for the rule.
 *
 * Not the data directory any more: on a native install that is the app
 * folder, so every backup lived inside the folder most likely to be
 * deleted, moved or overwritten — including by this app's own zip
 * updater.
 */
let cachedBackupDir: string | null = null;
export function backupDir(): string {
  if (cachedBackupDir) return cachedBackupDir;
  cachedBackupDir = resolveBackupDir(
    process.env,
    dataDir(),
    homedir(),
    process.platform,
    path.sep,
  ) as string;
  return cachedBackupDir;
}

/**
 * Everywhere to LOOK for a backup — the new location and the old one.
 *
 * An install that has been running for months has backups beside its
 * database. They must keep appearing in the restore list, or the move
 * reads as "the update deleted my backups".
 */
export function backupDirs(): string[] {
  return searchDirs(backupDir(), dataDir()) as string[];
}

/** Only for tests, which set env vars between cases. */
export function resetDataDirCache(): void {
  cached = null;
  cachedBackupDir = null;
}

export function dataFile(name: string): string {
  const preferred = path.join(dataDir(), name);
  if (existsSync(preferred)) return preferred;
  const legacy = path.join(process.cwd(), name);
  if (legacy !== preferred && existsSync(legacy)) return legacy;
  return preferred;
}
