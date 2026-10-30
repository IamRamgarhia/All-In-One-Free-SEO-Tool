/**
 * The decisions a zip-install update makes, separated from the parts
 * that touch the network and the disk.
 *
 * `bin/seo-update-zip.mjs` downloads a release and copies it over a
 * working install. Two of the judgements it makes are the difference
 * between an update and a disaster, and neither announces itself when
 * it is wrong:
 *
 *   - `shouldKeep` decides whether a file is the user's or ours. Get it
 *     wrong in one direction and their database, their API keys, or the
 *     key those keys are encrypted with is overwritten by a copy from a
 *     download. Nothing errors; they just open the app and their work
 *     is gone.
 *   - `compareVersions` decides whether to update at all. Get it wrong
 *     and a working install is replaced by an older one, or an update
 *     silently never happens.
 *
 * Same split as install-mode.mjs and app-port.mjs: pure here, tested
 * from src/lib/, with the I/O left in bin/.
 */

/**
 * Paths, relative to the install root, that an update must never write.
 *
 * Everything here is either the user's data or state identifying this
 * particular install. None of it can be recovered from a download: the
 * encryption key is what makes their stored API keys readable, and
 * without it they are noise.
 */
export const KEEP = [
  // data.db, and its -wal, -shm and .bak-<stamp> siblings.
  /^data\.db/,
  // The real env files only. NOT `.env.example`, which is tracked,
  // shipped, and the documented template — a blanket /^\.env/ would
  // freeze it at whatever version was first installed, so settings
  // added later would never be documented on an updated install.
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\..+\.local$/,
  // Encryption key, session secret, remembered port, install mode.
  /^\.seo-/,
  /^backups\//,
  /^public\/uploads\//,
  /^node_modules\//,
  /^\.git\//,
];

/** Is this path the user's, rather than ours to replace? */
export function shouldKeep(rel) {
  // Windows gives backslashes and the KEEP patterns are written with
  // forward slashes, so a `public\uploads\x.png` would otherwise sail
  // straight past the check that exists to protect it.
  const normalised = String(rel ?? "").replace(/\\/g, "/");
  return KEEP.some((rx) => rx.test(normalised));
}

/** "v0.10.0" / "0.10.0" -> [0, 10, 0]; anything unparseable -> null. */
export function parseVersion(raw) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(raw ?? ""));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * -1, 0 or 1 — or null when either side could not be read.
 *
 * null is a real answer and the caller stops on it. Treating an
 * unreadable version as "older" would overwrite an install on the
 * strength of a string nobody could parse.
 */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/**
 * The GitHub `owner/name` from package.json's repository url.
 *
 * Read rather than written down again. `src/lib/repo.ts` is the slug's
 * home and `repo.test.ts` already holds package.json to it; a third
 * copy here is precisely the pattern this codebase has found
 * already-drifted every time it has looked.
 */
export function repoSlug(pkg) {
  const url = String(pkg?.repository?.url ?? pkg?.repository ?? "");
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}
