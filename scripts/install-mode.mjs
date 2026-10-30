/**
 * Is this install running in Docker, or natively?
 *
 * The control panel has to know, because every one of its buttons drives
 * `bin/START.*` and the local `data.db`. On a Docker install that starts
 * a second app beside the container, against a different and empty
 * database, and reports success. Nothing errors.
 *
 * This lived inside control-panel.mjs as a function returning a boolean,
 * and CLAUDE.md recorded it as unverified against real Docker — there is
 * none on the machine this was written on, and a stubbed `docker.cmd`
 * cannot stand in because Node's `execFile` will not launch a `.cmd`.
 * Extracted here so the decision is pure and injectable: the only part
 * that still needs real Docker is whether `execFile` can start it, and
 * everything downstream of that is now covered by tests.
 *
 * The boolean was also the bug. "Not Docker" and "could not tell" were
 * the same answer, and the same answer was the dangerous one:
 *
 *   - Docker Desktop installed but not running — which is exactly when
 *     someone opens this panel looking for a Start button — makes
 *     `docker compose ps` fail. That read as native.
 *   - A slow daemon hitting the 6s timeout read as native.
 *   - Output in a format we cannot parse read as native.
 *
 * So there are three states, and UNKNOWN refuses rather than guessing.
 * That is the same rule template-preflight.ts applies to task
 * suppression: unknown is not a verdict.
 */

export const NATIVE = "native";
export const DOCKER = "docker";
export const UNKNOWN = "unknown";

/** The compose service name, from docker-compose.yml. */
export const SERVICE = "seo";

/**
 * An explicit override always wins.
 *
 * Detection is never perfect, which is the same reason tech-stack
 * detection is overridable. It is also the only way to exercise either
 * branch on a machine without Docker.
 */
export function forcedMode(env = {}) {
  const forced = String(env.SEO_INSTALL_MODE ?? "")
    .trim()
    .toLowerCase();
  if (forced === "docker") return DOCKER;
  if (forced === "native") return NATIVE;
  // Anything else is not an override, including a typo. A misspelled
  // value must not silently mean "detect" in a way the user cannot see;
  // the caller reports what it used.
  return forced ? UNKNOWN : null;
}

/**
 * What `docker compose ps -a --format json` tells us.
 *
 * `--format json` has emitted two different shapes: a single JSON array
 * in Compose v2 before 2.21, and NDJSON — one object per line — after.
 * Both are still in the wild, so both are read.
 *
 * Rows carry `Service` (the compose-file key), `Name` (the container)
 * and `Image`. Matching was previously `stdout.includes("seo")` against
 * the raw text, which is true of the image `seo-tool:local`, the volume
 * `seo-data`, and any path containing "seo" — including this project's
 * own directory. It happened to be right, for the wrong reason.
 *
 * @param stdout raw stdout, or null when the command failed to run
 */
export function readComposePs(stdout) {
  // Null means the command did not complete: daemon down, timeout, not
  // installed, permissions. We know nothing.
  if (stdout === null || stdout === undefined) return UNKNOWN;

  const text = String(stdout).trim();
  // An empty answer is a real answer: this compose project has no
  // containers, so the install is not a Docker one. `[]` is the array
  // form of the same thing.
  if (text === "" || text === "[]") return NATIVE;

  let rows;
  try {
    const parsed = JSON.parse(text);
    rows = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // NDJSON: one object per line. A single malformed line should not
    // discard the rest, but if nothing parses we cannot claim native.
    rows = [];
    let seenBadLine = false;
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        rows.push(JSON.parse(t));
      } catch {
        seenBadLine = true;
      }
    }
    if (rows.length === 0) return UNKNOWN;
    if (seenBadLine && !rows.some(isOurs)) return UNKNOWN;
  }

  if (!Array.isArray(rows) || rows.length === 0) return UNKNOWN;
  return rows.some(isOurs) ? DOCKER : NATIVE;
}

/** Does this compose row describe this app's container? */
function isOurs(row) {
  if (!row || typeof row !== "object") return false;
  // Modern output carries the compose-file key directly. Prefer it.
  if (String(row.Service ?? "") === SERVICE) return true;
  if (serviceFromContainerName(row.Name ?? row.name) === SERVICE) return true;
  return String(row.Image ?? "") === "seo-tool:local";
}

/**
 * Pull the service out of a container name, for shapes that omit
 * `Service`.
 *
 * Compose names containers `<project><sep><service><sep><index>`, with
 * `-` in v2 and `_` in v1. So the service is the segment before the
 * trailing index — not any segment, and certainly not a substring.
 *
 * Matching loosely is a trap worth spelling out. `includes("seo")` was
 * the original check. Matching "seo" as a delimited segment looks
 * stricter and still gets `video-seo-helper-web-1` wrong, because "seo"
 * really is a segment of that project's name. Only the position is
 * decisive, which is why a test covers that exact name.
 */
function serviceFromContainerName(raw) {
  const name = String(raw ?? "");
  if (!name) return null;
  const parts = name.split(/[-_]/).filter(Boolean);
  if (parts.length < 2) return null;
  // Drop the replica index when there is one. A name with no index is
  // possible via container_name, in which case the last segment is the
  // best guess available.
  if (/^\d+$/.test(parts[parts.length - 1])) parts.pop();
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * Decide the install mode.
 *
 * Every dependency is injected so this is testable without Docker, a
 * filesystem, or a child process.
 *
 * @param deps.env            process.env
 * @param deps.hasComposeFile () => boolean
 * @param deps.hasDockerBin   () => Promise<boolean>
 * @param deps.composePs      () => Promise<string|null>
 */
export async function detectInstallMode(deps) {
  const { env = {}, hasComposeFile, hasDockerBin, composePs } = deps;

  const forced = forcedMode(env);
  if (forced === DOCKER || forced === NATIVE) {
    return { mode: forced, why: `SEO_INSTALL_MODE=${forced}`, forced: true };
  }
  if (forced === UNKNOWN) {
    return {
      mode: UNKNOWN,
      why:
        `SEO_INSTALL_MODE is set to something that is neither "docker" nor ` +
        `"native", so it is not clear what was meant.`,
      forced: true,
    };
  }

  // No compose file means nothing here was ever meant to run in Docker.
  if (!hasComposeFile()) {
    return { mode: NATIVE, why: "no docker-compose.yml in this folder" };
  }
  // A compose file ships with this repo, so its presence alone says
  // nothing. Without the docker binary, though, it cannot be a Docker
  // install.
  if (!(await hasDockerBin())) {
    return { mode: NATIVE, why: "docker is not installed" };
  }

  const mode = readComposePs(await composePs());
  if (mode === DOCKER) {
    return { mode, why: `docker compose has a "${SERVICE}" container` };
  }
  if (mode === NATIVE) {
    return { mode, why: "docker is installed but this project has no containers" };
  }
  return {
    mode: UNKNOWN,
    why:
      "Docker is installed but would not say whether this project has " +
      "containers — it is usually not running. Start Docker Desktop, or " +
      "set SEO_INSTALL_MODE=docker or =native to say which this is.",
  };
}
