import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_SLUG } from "./repo";
import {
  KEEP,
  compareVersions,
  parseVersion,
  repoSlug,
  shouldKeep,
} from "../../scripts/update-plan.mjs";

/**
 * The two judgements a zip-install update makes that can lose data.
 *
 * `bin/seo-update-zip.mjs` copies a downloaded release over a working
 * install. If `shouldKeep` says a user's file is ours, it is replaced
 * by a copy from the internet and nothing errors — they simply open the
 * app and their clients, keywords and audits are gone. That is the
 * worst failure this project can have, so the list is tested rather
 * than reviewed.
 */

describe("shouldKeep", () => {
  it("protects the database and everything beside it", () => {
    // -wal and -shm hold committed data the main file does not; a
    // .bak-* is someone's only copy of a database they already lost.
    for (const f of [
      "data.db",
      "data.db-wal",
      "data.db-shm",
      "data.db.bak-2026-10-30T11-18-15Z",
    ]) {
      expect(shouldKeep(f), f).toBe(true);
    }
  });

  it("protects secrets and per-install state", () => {
    for (const f of [
      ".env",
      ".env.local",
      ".env.production.local",
      // Without this one, every stored API key becomes undecryptable
      // noise and the user cannot tell why.
      ".seo-encryption-key",
      ".seo-session-secret",
      ".seo-port",
      ".seo-install-mode",
    ]) {
      expect(shouldKeep(f), f).toBe(true);
    }
  });

  it("protects backups and uploads, at any depth", () => {
    expect(shouldKeep("backups/data-before-update-from-v0.9.0-2026-10-30.db")).toBe(
      true,
    );
    expect(shouldKeep("public/uploads/screenshot.png")).toBe(true);
    expect(shouldKeep("public/uploads/nested/deep/file.png")).toBe(true);
  });

  it("treats a Windows path the same as a POSIX one", () => {
    // The caller builds these from readdirSync on Windows. A pattern
    // written with forward slashes silently fails to match, and the
    // thing it was protecting gets overwritten.
    expect(shouldKeep("public\\uploads\\shot.png")).toBe(true);
    expect(shouldKeep("backups\\old.db")).toBe(true);
  });

  it("does NOT freeze .env.example", () => {
    // It is tracked, shipped, and the documented template. A blanket
    // /^\.env/ would pin it to whatever version was first installed, so
    // settings added later would never be documented on an updated
    // install — a quiet, permanent documentation gap.
    expect(shouldKeep(".env.example")).toBe(false);
  });

  it("replaces the app's own code", () => {
    // The other direction: if these were kept, "update" would download
    // a release and change nothing, while reporting success.
    for (const f of [
      "package.json",
      "src/lib/audit.ts",
      "scripts/migrate.cjs",
      "bin/START.cmd",
      "public/icon.ico",
      "README.md",
    ]) {
      expect(shouldKeep(f), f).toBe(false);
    }
  });

  it("is not fooled by a name that merely starts similarly", () => {
    // `data.db` is a prefix match on purpose (for -wal/-shm/.bak), so
    // check the patterns that are NOT meant to be prefixes.
    expect(shouldKeep("backupsomething.ts")).toBe(false);
    expect(shouldKeep("src/backups/helper.ts")).toBe(false);
    expect(shouldKeep("public/uploadsx/file.png")).toBe(false);
  });

  it("every pattern is anchored at the start", () => {
    // An unanchored pattern would match deep inside the tree and keep
    // app code — the silent no-op update above.
    for (const rx of KEEP) {
      expect(rx.source.startsWith("^"), `${rx} is not anchored`).toBe(true);
    }
  });
});

describe("compareVersions", () => {
  it("orders releases correctly", () => {
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.10.0", "0.10.0")).toBe(0);
  });

  it("compares numerically, not as text", () => {
    // The whole reason this is not a string compare: "0.9.0" sorts
    // AFTER "0.10.0" alphabetically, so a text comparison would report
    // the newest release as older and never update anyone again.
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
  });

  it("ignores a leading v, which is how tags are written", () => {
    expect(compareVersions("0.10.0", "v0.10.0")).toBe(0);
    expect(compareVersions("0.9.0", "v0.10.0")).toBe(-1);
  });

  it("returns null rather than guessing", () => {
    // The caller stops on null. Treating an unreadable version as
    // "older" would overwrite a working install on the strength of a
    // string nobody could parse.
    for (const [a, b] of [
      ["0.10.0", "latest"],
      ["", "v1.0.0"],
      ["0.10.0", ""],
      ["0.10.0", null],
    ] as const) {
      expect(compareVersions(a, b), `${a} vs ${b}`).toBeNull();
    }
  });
});

describe("parseVersion", () => {
  it("reads the three numbers out of a tag", () => {
    expect(parseVersion("v0.10.0")).toEqual([0, 10, 0]);
    expect(parseVersion("0.10.0")).toEqual([0, 10, 0]);
    expect(parseVersion("release-1.2.3-beta")).toEqual([1, 2, 3]);
  });

  it("returns null for anything without three numbers", () => {
    for (const v of ["", "v1", "1.2", "latest", null, undefined]) {
      expect(parseVersion(v), String(v)).toBeNull();
    }
  });
});

describe("repoSlug", () => {
  it("reads this repo's real package.json correctly", () => {
    /**
     * Built from REPO_SLUG and the real package.json rather than from a
     * literal. src/lib/repo.ts is the slug's home, and repo.test.ts
     * fails the build on any file that writes it out again — including
     * this one, which it caught. That guard exists because the slug was
     * once hardcoded in 20 places, 7 of them already stale.
     *
     * Deriving it here also makes this a stronger test: it checks that
     * the updater would resolve the actual shipped package.json to the
     * actual canonical slug, not that a regex matches a string I chose.
     */
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    );
    expect(repoSlug(pkg)).toBe(REPO_SLUG);
  });

  it("handles the shorthand and ssh forms", () => {
    expect(repoSlug({ repository: "https://github.com/owner/name" })).toBe("owner/name");
    expect(repoSlug({ repository: { url: "git@github.com:owner/name.git" } })).toBe(
      "owner/name",
    );
  });

  it("returns null when there is nothing to read", () => {
    // The caller stops and says so. Falling back to a guessed slug
    // would download someone else's release over this app.
    for (const pkg of [{}, { repository: "" }, { repository: { url: "not a url" } }]) {
      expect(repoSlug(pkg), JSON.stringify(pkg)).toBeNull();
    }
  });
});
