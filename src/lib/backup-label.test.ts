import { describe, expect, it } from "vitest";
import {
  backupOptionLabel,
  describeBackup,
  relativeAge,
} from "../../scripts/backup-label.mjs";

/**
 * The restore dropdown is the one control on the panel that can lose
 * data, and it listed raw filenames:
 *
 *   today 04:46 · 2.8 MB · data-before-0075-fk-2026-10-29.db
 *   10/29/2026 18:59 · 2.9 MB · data-before-acme-delete-185920.db
 *   9/24/2026 19:02 · 2.3 MB · data.db.bak-2026-09-24T13-32-23Z
 *
 * Three date formats, the date repeated inside most names, and nothing
 * that answers "what is this one". Reported by the user as, simply,
 * "this is not easy to understand".
 *
 * The real names on this install are the fixtures below.
 */

describe("describeBackup", () => {
  it("calls the nightly/manual snapshots a routine backup, without guessing which", () => {
    // The app's scheduler (auto-backup.ts) and the panel's own Back up
    // now both write <db>.bak-<stamp> into the data dir. Nothing
    // distinguishes them afterwards, so neither gets labelled "nightly".
    for (const name of [
      "data.db.bak-2026-09-24T13-32-23Z",
      "data.db.bak-2026-10-29T10-52-39Z",
    ]) {
      const d = describeBackup("data", name);
      expect(d.kind).toBe("routine backup");
      expect(d.detail).toBeNull();
      expect(JSON.stringify(d)).not.toMatch(/nightly|manual/i);
    }
  });

  it("reads a migration number out of a safety copy", () => {
    expect(describeBackup("backups", "data-before-0075-fk-2026-10-29.db")).toEqual({
      kind: "safety copy",
      detail: "taken before database update 0075",
    });
  });

  it("reads a migration range", () => {
    expect(
      describeBackup("backups", "data-before-0071-0074-2026-10-29.db").detail,
    ).toBe("taken before database updates 0071–0074");
  });

  it("humanises a named reason and drops its timestamp", () => {
    // `185920` is a time, not part of the reason.
    expect(
      describeBackup("backups", "data-before-acme-delete-185920.db").detail,
    ).toBe("taken before acme delete");
    expect(
      describeBackup("backups", "data-before-acme-delete-2026-10-29.db").detail,
    ).toBe("taken before acme delete");
    expect(
      describeBackup("backups", "data-before-retro-preflight-2026-09-23.db")
        .detail,
    ).toBe("taken before retro preflight");
  });

  it("does not invent a provenance for a file it did not write", () => {
    const d = describeBackup("backups", "something-someone-dropped-here.db");
    expect(d.kind).toBe("copy of the database");
    expect(d.detail).toBeNull();
  });

  it("never returns the raw filename as the description", () => {
    // The whole point. If a future name falls through every branch, the
    // fallback must still be words.
    for (const [bucket, name] of [
      ["data", "data.db.bak-2026-10-29T10-52-39Z"],
      ["backups", "data-before-0075-fk-2026-10-29.db"],
      ["backups", "data-before-acme-delete-185920.db"],
      ["backups", "mystery.db"],
      ["backups", ""],
    ] as const) {
      const d = describeBackup(bucket, name);
      expect(d.kind).toBeTruthy();
      expect(d.kind).not.toContain(".db");
      if (d.detail) expect(d.detail).not.toContain(".db");
    }
  });
});

describe("backupOptionLabel", () => {
  it("puts the words before the numbers and omits the filename", () => {
    const label = backupOptionLabel({
      when: "Today 04:46",
      sizeMb: 2.8,
      ...describeBackup("backups", "data-before-0075-fk-2026-10-29.db"),
    });
    expect(label).toBe(
      "Today 04:46  ·  safety copy, taken before database update 0075  ·  2.8 MB",
    );
    expect(label).not.toContain("data-before");
  });

  it("reads cleanly with no detail", () => {
    expect(
      backupOptionLabel({
        when: "24 Sep, 19:02",
        sizeMb: 2.3,
        ...describeBackup("data", "data.db.bak-2026-09-24T13-32-23Z"),
      }),
    ).toBe("24 Sep, 19:02  ·  routine backup  ·  2.3 MB");
  });
});

describe("relativeAge", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");

  it.each([
    ["2026-10-30T11:59:40Z", "just now"],
    ["2026-10-30T11:45:00Z", "15 minutes ago"],
    ["2026-10-30T09:00:00Z", "3 hours ago"],
    ["2026-10-28T12:00:00Z", "2 days ago"],
    ["2026-10-16T12:00:00Z", "2 weeks ago"],
    ["2026-07-30T12:00:00Z", "3 months ago"],
  ])("%s reads as %s", (iso, expected) => {
    expect(relativeAge(iso, now)).toBe(expected);
  });

  it("uses the singular where it should", () => {
    expect(relativeAge("2026-10-30T11:59:00Z", now)).toBe("1 minute ago");
    expect(relativeAge("2026-10-30T11:00:00Z", now)).toBe("1 hour ago");
    expect(relativeAge("2026-10-29T12:00:00Z", now)).toBe("1 day ago");
  });

  it("returns null rather than NaN for an unreadable date", () => {
    expect(relativeAge("not a date", now)).toBeNull();
  });
});
