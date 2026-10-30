/**
 * Where backups go.
 *
 * They used to go in the data directory, which on a native install IS
 * the app folder — so `data.db.bak-*` sat beside `data.db`, inside the
 * folder people delete, move, replace or re-download. Every copy of the
 * database lived in the blast radius of the one action most likely to
 * destroy the original. The zip updater makes that concrete: it writes
 * a release over that folder.
 *
 * WHY NOT Documents
 *
 * That was the first choice — it is where the GST billing app puts
 * them, and it is the folder a non-technical user can actually find.
 * It was measured on the maintainer's Windows machine before shipping,
 * and `fs.mkdirSync` inside `C:\Users\princ\Documents` did not fail:
 * it HUNG, past a five-minute timeout, with the folder carrying the
 * ReadOnly attribute. Documents is routinely redirected into OneDrive
 * or watched by sync and anti-virus filter drivers, and those can block
 * a write indefinitely rather than refusing it.
 *
 * That is the worst possible shape for this particular feature. The
 * backup runs on a timer and from a button, `VACUUM INTO` through
 * better-sqlite3 is synchronous, and a synchronous call cannot be
 * timed out from inside the process that made it — so a hanging folder
 * does not produce a slow backup, it freezes the control panel with no
 * error at all. Pressing "Back up" killed the panel, which is how this
 * was found.
 *
 * So the default is the per-user application-data folder the platform
 * already designates: outside the app folder, which was the whole
 * point, and not a path that sync and backup software fights over.
 * Measured on the same machine: 2ms to create, VACUUM INTO fine.
 * Anyone who wants Documents can say so with SEO_BACKUP_DIR.
 *
 * THE ORDER, and why each step is before the next:
 *
 *   1. `SEO_BACKUP_DIR` wins. Someone pointing backups at another disk
 *      or a synced folder has already answered this question.
 *   2. A deliberately-placed data directory keeps its backups. If
 *      `SEO_DATA_DIR` or `SEO_DB_PATH` is set, or this is Docker, the
 *      data is already somewhere chosen on purpose and outside the app.
 *      In Docker that place is the mounted volume, and it is the ONLY
 *      place a backup survives the container being recreated — writing
 *      to a container's app-data folder would put every backup inside
 *      the thing that gets thrown away.
 *   3. Otherwise, the platform's app-data folder.
 *
 * Reading is a different question from writing, which is why
 * `backupSearchDirs` exists. An install that has been running for
 * months has backups in the old place, and they must not disappear from
 * the restore list the day it updates.
 *
 * Pure and injectable so it can be tested for any platform on any
 * machine, and so the control panel (plain .mjs, no TypeScript) and the
 * app share one answer instead of each having their own.
 */

const APP_FOLDER = "SEO Tool";

/** Joined with whichever separator the caller's platform uses. */
function joinPath(sep, ...parts) {
  return parts
    .map((p, i) => (i === 0 ? String(p).replace(/[\\/]+$/, "") : p))
    .join(sep);
}

/**
 * @param env      process.env
 * @param dataDir  the resolved data directory
 * @param home     os.homedir()
 * @param platform process.platform
 * @param sep      path separator
 */
export function resolveBackupDir(env, dataDir, home, platform, sep = "/") {
  if (env?.SEO_BACKUP_DIR) return String(env.SEO_BACKUP_DIR);

  // Already placed on purpose, and already outside the app folder.
  if (env?.SEO_DATA_DIR || env?.SEO_DB_PATH || env?.RUNNING_IN_DOCKER === "1") {
    return dataDir;
  }

  const base = appDataBase(env, home, platform, sep);
  // Nowhere sensible to write (no home directory — some service
  // accounts and some containers). The data dir is worse but it is
  // somewhere, and a backup in an awkward place beats no backup.
  if (!base) return dataDir;

  return joinPath(sep, base, "Backups");
}

/** The platform's per-user application-data folder for this app. */
function appDataBase(env, home, platform, sep) {
  if (platform === "win32") {
    // %LOCALAPPDATA%, and not Roaming: a database is far too big to
    // sync with a roaming profile, which is the same class of problem
    // as putting it in OneDrive.
    const local = env?.LOCALAPPDATA;
    if (local) return joinPath(sep, local, APP_FOLDER);
    if (home) return joinPath(sep, home, "AppData", "Local", APP_FOLDER);
    return null;
  }

  if (platform === "darwin") {
    if (!home) return null;
    return joinPath(sep, home, "Library", "Application Support", APP_FOLDER);
  }

  // Linux and the rest: the XDG basedir spec, which is what a user's
  // own backup tooling will already be looking at.
  if (env?.XDG_DATA_HOME) return joinPath(sep, env.XDG_DATA_HOME, "seo-tool");
  if (!home) return null;
  return joinPath(sep, home, ".local", "share", "seo-tool");
}

/**
 * Everywhere a backup might be, newest policy first.
 *
 * De-duplicated, because on Docker and on an explicitly-placed data dir
 * these are the same folder and listing it twice shows every backup
 * twice.
 */
export function backupSearchDirs(backupDir, dataDir) {
  const out = [];
  for (const d of [backupDir, dataDir]) {
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}
