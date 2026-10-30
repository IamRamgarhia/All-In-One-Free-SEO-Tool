/**
 * Where is the app, and is the thing answering actually ours?
 *
 * The control panel's "Running" light, its "Open the app" button and its
 * "stop it first" prompts all depend on this. It used to be two lines
 * inside control-panel.mjs that trusted `.seo-port`:
 *
 *     const n = Number(readTextIfPresent(".seo-port") ?? PORT ?? 3000);
 *     fetch(`http://localhost:${n}/api/v1/health`)
 *
 * `.seo-port` records where bin/START.* put the app the last time IT
 * started it, which is not the same question as where the app is now.
 * Measured on this machine 30 Oct 2026: the file said 3399 while a
 * healthy app answered on 3000, because that run had been started
 * directly rather than through the launcher. The panel reported
 * "Installed, not running" over a running app and aimed "Open the app"
 * at a dead port — a confident wrong answer, which this project treats
 * as worse than a crash.
 *
 * So the file is the first guess, not the answer, and the health
 * response is checked to belong to THIS install before it is believed.
 * Port 3000 is the most contended port in local development; without
 * that check, another project's dev server on 3000 reads as ours and
 * the Stop button gets aimed at it.
 */

/**
 * Ports to try, best guess first, de-duplicated.
 *
 * Deliberately short. Scanning a range would find an app faster in odd
 * cases and would also make "is it running?" depend on what else is
 * listening, which is how the first bug happened.
 *
 * @param remembered contents of .seo-port, or null
 * @param envPort    process.env.PORT, or undefined
 */
export function candidatePorts(remembered, envPort, fallback = 3000) {
  const out = [];
  for (const raw of [remembered, envPort, fallback]) {
    const n = Number(raw);
    // Number("") is 0 and Number(null) is 0, so the range check is doing
    // real work here, not decoration.
    if (Number.isFinite(n) && n > 0 && n < 65536 && !out.includes(n)) {
      out.push(n);
    }
  }
  return out;
}

/**
 * Two spellings of one path.
 *
 * Windows paths differ in case and in trailing and leading separator
 * style and are still the same folder; everywhere else they are bytes.
 */
export function samePath(a, b, isWindows) {
  const norm = (p) => {
    const s = String(p ?? "").replace(/[\\/]+$/, "");
    return isWindows ? s.toLowerCase().replace(/\//g, "\\") : s;
  };
  const left = norm(a);
  // An empty path matches nothing, including another empty one —
  // otherwise a health response with no installRoot and a missing ROOT
  // would "match" and the panel would adopt a stranger.
  return left !== "" && left === norm(b);
}

/**
 * Does this /api/v1/health body describe this install's app?
 *
 * A field that is ABSENT is not a mismatch. An older build of the app
 * predates `installRoot`, and refusing to see it would replace one
 * wrong answer with another — the panel would report a running app as
 * stopped, which is where this started. A field that is PRESENT and
 * different is a mismatch, and that is the case worth catching.
 */
export function healthMatches(body, root, isWindows) {
  // Array.isArray, because an array IS an object to typeof and has
  // neither field, so it would otherwise fall through to the permissive
  // "older build" branch at the bottom and be adopted.
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (body.service && body.service !== "seo-tool") return false;
  if (body.installRoot && !samePath(body.installRoot, root, isWindows)) return false;
  // With neither field there is nothing to go on but the fact that
  // something answered this app's health path with JSON. That is the
  // pre-installRoot behaviour, kept deliberately.
  return true;
}
