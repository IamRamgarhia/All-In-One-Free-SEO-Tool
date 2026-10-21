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
 *   - audit-previews/ (SEOmator landing PNGs per audit id)
 */

import path from "node:path";
import { existsSync } from "node:fs";

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
export function dataFile(name: string): string {
  const preferred = path.join(dataDir(), name);
  if (existsSync(preferred)) return preferred;
  const legacy = path.join(process.cwd(), name);
  if (legacy !== preferred && existsSync(legacy)) return legacy;
  return preferred;
}
