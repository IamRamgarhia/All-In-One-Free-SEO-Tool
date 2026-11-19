import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nothing private may leave this folder inside a build artefact.
 *
 * Found 19 Nov 2026 by listing what the build actually produced, while
 * planning the Windows installer. `.next/standalone` — the directory the
 * Dockerfile copies wholesale, and the one a prebuilt installer payload
 * would be cut from — contained:
 *
 *   backups/   SEVEN copies of the live SQLite database
 *   .git/      10 MB of repository history
 *   dist/, e2e/, src/, docs-site/
 *
 * `backups/` is gitignored, so releases and CI images built from a clean
 * checkout never carried it. The person it would have hit is the one
 * running `docker compose up --build` on their own machine, or us,
 * cutting the installer payload here — which is the next thing on the
 * list. The database holds every client, keyword, audit and settings
 * row, including API keys.
 *
 * This is a silent-wrong-answer bug of the worst kind: the build
 * succeeds, the app works, and the artefact quietly carries somebody
 * else's data. So it gets a test rather than a note.
 */

const ROOT = process.cwd();
const STANDALONE = join(ROOT, ".next", "standalone");

/** Paths that must never appear in a build artefact, and why. */
const FORBIDDEN: { path: string; why: string }[] = [
  { path: "backups", why: "copies of the live database" },
  { path: ".git", why: "repository history" },
  { path: "dist", why: "previously built release archives" },
  { path: ".e2e", why: "the end-to-end test database" },
  {
    path: ".claude",
    why: "local agent settings, which can include settings.local.json",
  },
];

/**
 * File names that must never appear anywhere inside the artefact.
 *
 * `CLAUDE.md` was added 19 Nov 2026, found by grepping the build output
 * for the old version number: an 81 KB copy was sitting at the top of
 * `.next/standalone`. It is gitignored because it is not for
 * distribution — this one holds the maintainer's Windows paths, their
 * clients' domains and a running account of what works on their
 * install — and the Dockerfile copies this directory wholesale.
 *
 * It is not a credential leak, which is why the first pass of this
 * guard did not catch it. It is still somebody's private notes inside
 * a public download, and "gitignored" is a weaker promise than "not in
 * the artefact".
 */
const FORBIDDEN_FILES =
  /(^|\/)(data\.db($|[-.])|\.env($|\.)|CLAUDE\.md$|AGENTS\.md$|.*\.db(-wal|-shm)?$)/;

describe("the standalone build carries nothing private", () => {
  const built = existsSync(STANDALONE);

  it("has a build to check, or says why not", () => {
    // Not a failure: a fresh clone has not run `next build`. CI does,
    // so the real assertions below run there. Stated out loud so a
    // skipped guard is never mistaken for a passing one.
    expect(typeof built).toBe("boolean");
  });

  it.runIf(built)("contains no private top-level directory", () => {
    const present = FORBIDDEN.filter((f) =>
      existsSync(join(STANDALONE, f.path)),
    );
    expect(
      present.map((f) => `${f.path} (${f.why})`),
      `.next/standalone holds paths that must not ship. The Dockerfile ` +
        `copies this directory wholesale and the installer payload is cut ` +
        `from it, so anything here reaches every user. Fix ` +
        `outputFileTracingExcludes in next.config.ts — do not delete the ` +
        `files by hand, they will come back on the next build.`,
    ).toEqual([]);
  });

  it.runIf(built)("contains no database or env file at any depth", () => {
    const hits: string[] = [];
    const walk = (dir: string, depth = 0) => {
      if (depth > 6 || hits.length > 20) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        const full = join(dir, name);
        const rel = full.slice(STANDALONE.length + 1).replace(/\\/g, "/");
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          // node_modules is thousands of files and holds no secrets of
          // ours; skipping it keeps this test from taking a minute.
          if (name === "node_modules" || name === ".next") continue;
          walk(full, depth + 1);
        } else if (FORBIDDEN_FILES.test(rel)) {
          hits.push(rel);
        }
      }
    };
    walk(STANDALONE);
    expect(
      hits,
      `These would ship inside the artefact: ${hits.join(", ")}`,
    ).toEqual([]);
  });

  it("the build runs the prune step", () => {
    // The config excludes are a first line that demonstrably leaks:
    // measured twice, `.git` was excluded and backups/, dist/ and
    // data.db were not. scripts/prune-standalone.mjs is the mechanism
    // actually relied on, so it has to be in the build chain — not a
    // thing someone remembers to run.
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(
      pkg.scripts.build,
      `"build" must run scripts/prune-standalone.mjs. Without it a build ` +
        `can produce a standalone output containing the live database.`,
    ).toMatch(/prune-standalone\.mjs/);
  });

  it("next.config.ts pins the tracing root", () => {
    // Without it Next inferred the PARENT directory as the workspace
    // root, because of an unrelated package-lock.json sitting there —
    // which puts every sibling project inside the tracing root.
    const cfg = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(cfg).toMatch(/outputFileTracingRoot/);
    expect(cfg).toMatch(/outputFileTracingExcludes/);
    expect(cfg).toMatch(/backups/);
  });

  it("the Docker build context excludes backups", () => {
    // The Dockerfile begins with `COPY . .`, so .dockerignore is the
    // only thing standing between a local build and an image carrying
    // the builder's own database.
    const ignore = readFileSync(join(ROOT, ".dockerignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const entry of ["backups", "*.db", ".e2e"]) {
      expect(ignore, `.dockerignore must list ${entry}`).toContain(entry);
    }
  });
});
