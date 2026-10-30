import { describe, expect, it } from "vitest";
import { backupSearchDirs, resolveBackupDir } from "../../scripts/backup-dir.mjs";

/**
 * Where backups go.
 *
 * They used to go in the data directory, which on a native install IS
 * the app folder — so every copy of the database lived inside the
 * folder people delete, move, replace or re-download, and which this
 * app's own zip updater writes a release over.
 *
 * Two things this has to get right, both found by measurement:
 *
 *   - NOT Documents, which was the first choice. On the maintainer's
 *     Windows machine `mkdirSync` inside it hung past a five-minute
 *     timeout rather than failing — Documents is routinely redirected
 *     into OneDrive or watched by sync/anti-virus filter drivers.
 *     `VACUUM INTO` is synchronous and a synchronous call cannot be
 *     timed out from inside the process, so that does not produce a
 *     slow backup; it freezes the control panel with no error. It did.
 *
 *   - Docker keeps its backups on the mounted volume. That is the ONLY
 *     place they survive the container being recreated, which is
 *     exactly when someone needs one.
 */

describe("resolveBackupDir", () => {
  it("uses %LOCALAPPDATA% on Windows", () => {
    expect(
      resolveBackupDir(
        { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
        "C:\\app",
        "C:\\Users\\me",
        "win32",
        "\\",
      ),
    ).toBe("C:\\Users\\me\\AppData\\Local\\SEO Tool\\Backups");
  });

  it("never picks Documents on its own", () => {
    // The measured hang. If this ever starts returning a Documents
    // path again, the control panel freezes when someone presses Back
    // up, with no error anywhere.
    const win = resolveBackupDir(
      { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
      "C:\\app",
      "C:\\Users\\me",
      "win32",
      "\\",
    );
    const mac = resolveBackupDir({}, "/app", "/Users/me", "darwin", "/");
    const nix = resolveBackupDir({}, "/app", "/home/me", "linux", "/");
    for (const p of [win, mac, nix]) {
      expect(p.toLowerCase(), `${p} is under Documents`).not.toContain("documents");
    }
  });

  it("falls back to the AppData path when LOCALAPPDATA is unset", () => {
    expect(resolveBackupDir({}, "C:\\app", "C:\\Users\\me", "win32", "\\")).toBe(
      "C:\\Users\\me\\AppData\\Local\\SEO Tool\\Backups",
    );
  });

  it("uses Application Support on macOS", () => {
    expect(resolveBackupDir({}, "/app", "/Users/me", "darwin", "/")).toBe(
      "/Users/me/Library/Application Support/SEO Tool/Backups",
    );
  });

  it("follows the XDG spec on Linux", () => {
    expect(resolveBackupDir({}, "/app", "/home/me", "linux", "/")).toBe(
      "/home/me/.local/share/seo-tool/Backups",
    );
    expect(
      resolveBackupDir({ XDG_DATA_HOME: "/data/xdg" }, "/app", "/home/me", "linux", "/"),
    ).toBe("/data/xdg/seo-tool/Backups");
  });

  it("keeps Docker backups on the mounted volume", () => {
    // The case that must not change. /data is the volume; an app-data
    // folder inside a container is discarded when the container is
    // recreated, which is exactly when the backup is needed.
    expect(
      resolveBackupDir(
        { RUNNING_IN_DOCKER: "1", SEO_DATA_DIR: "/data", LOCALAPPDATA: "/ignored" },
        "/data",
        "/root",
        "linux",
        "/",
      ),
    ).toBe("/data");
  });

  it("respects a data directory that was placed on purpose", () => {
    for (const env of [{ SEO_DATA_DIR: "/mnt/disk" }, { SEO_DB_PATH: "/mnt/disk/data.db" }]) {
      expect(resolveBackupDir(env, "/mnt/disk", "/home/me", "linux", "/")).toBe(
        "/mnt/disk",
      );
    }
  });

  it("lets SEO_BACKUP_DIR override everything", () => {
    // Including Documents, for anyone who wants it there knowing the
    // risk — which is the escape hatch that makes the default safe to
    // choose on everyone's behalf.
    expect(
      resolveBackupDir(
        {
          SEO_BACKUP_DIR: "C:\\Users\\me\\Documents\\My Backups",
          SEO_DATA_DIR: "/data",
          RUNNING_IN_DOCKER: "1",
        },
        "/data",
        "/home/me",
        "win32",
        "\\",
      ),
    ).toBe("C:\\Users\\me\\Documents\\My Backups");
  });

  it("falls back to the data dir when there is nowhere else", () => {
    // Service accounts and some containers have no home directory. A
    // backup in an awkward place beats an update that cannot take one.
    expect(resolveBackupDir({}, "/app", "", "linux", "/")).toBe("/app");
    expect(resolveBackupDir({}, "/app", null, "darwin", "/")).toBe("/app");
    expect(resolveBackupDir({}, "C:\\app", "", "win32", "\\")).toBe("C:\\app");
  });

  it("ignores an empty env value rather than treating it as a choice", () => {
    // `SEO_BACKUP_DIR=` in a .env file is not an instruction to write
    // backups to the empty string.
    expect(
      resolveBackupDir(
        { SEO_BACKUP_DIR: "", SEO_DATA_DIR: "", XDG_DATA_HOME: "" },
        "/app",
        "/home/me",
        "linux",
        "/",
      ),
    ).toBe("/home/me/.local/share/seo-tool/Backups");
  });

  it("does not double a separator the base already ends with", () => {
    expect(
      resolveBackupDir({ LOCALAPPDATA: "C:\\Local\\" }, "C:\\app", "C:\\Users\\me", "win32", "\\"),
    ).toBe("C:\\Local\\SEO Tool\\Backups");
  });

  it("always lands outside the app folder", () => {
    // The entire point. If the answer is ever inside the install
    // directory again, deleting or re-downloading the app takes every
    // backup with it.
    const app = "/home/me/seo";
    for (const [platform, home, env] of [
      ["win32", "C:\\Users\\me", { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" }],
      ["darwin", "/Users/me", {}],
      ["linux", "/home/me", {}],
    ] as const) {
      const dir = resolveBackupDir(env, app, home, platform, platform === "win32" ? "\\" : "/");
      expect(dir.startsWith(app), `${dir} is inside ${app}`).toBe(false);
    }
  });
});

describe("backupSearchDirs", () => {
  it("looks in the new place and the old one", () => {
    // An install running for months has backups beside its database.
    // Dropping them from the list reads as "the update deleted them".
    expect(backupSearchDirs("/home/me/.local/share/seo-tool/Backups", "/app")).toEqual([
      "/home/me/.local/share/seo-tool/Backups",
      "/app",
    ]);
  });

  it("does not list one folder twice", () => {
    // On Docker the two are the same path, and every backup would
    // otherwise appear twice, under two different ids.
    expect(backupSearchDirs("/data", "/data")).toEqual(["/data"]);
  });

  it("skips an empty entry", () => {
    expect(backupSearchDirs("", "/app")).toEqual(["/app"]);
  });
});
