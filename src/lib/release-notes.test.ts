/**
 * Every released version must be findable in both places that describe
 * releases.
 *
 * WHY THIS TEST EXISTS: `docs/releases/` had notes for v0.10.0 and
 * v0.10.1 and `CHANGELOG.md` jumped straight from v0.9.0 to v0.8.0 —
 * two shipped releases missing from the file whose first line says it
 * "is the short version". Nobody noticed for three weeks.
 *
 * That is the dullest kind of wrong and the cheapest to prevent. A
 * reader who checks the changelog for what changed and finds their own
 * version absent has no way to tell whether the release was trivial or
 * the file is stale.
 *
 * It also catches the version bump that forgets its notes, which is the
 * same mistake from the other end: package.json says 0.10.2 and nothing
 * anywhere says what 0.10.2 is.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function changelog(): string {
  return readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
}

/** Versions with a notes file under docs/releases. */
function versionsWithNotes(): string[] {
  return readdirSync(join(ROOT, "docs/releases"))
    .map((f) => f.match(/^v(\d+\.\d+\.\d+)\.md$/)?.[1])
    .filter((v): v is string => Boolean(v));
}

function packageVersion(): string {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
}

describe("release notes", () => {
  it("finds notes files to check, or this test proves nothing", () => {
    // A vacuous pass is the risk: if the filename pattern stopped
    // matching, every assertion below would hold over an empty list.
    expect(versionsWithNotes().length).toBeGreaterThanOrEqual(8);
  });

  it("every version with notes has a CHANGELOG entry", () => {
    const text = changelog();
    const missing = versionsWithNotes().filter(
      (v) => !new RegExp(`^## v${v.replace(/\./g, "\\.")}\\b`, "m").test(text),
    );
    expect(
      missing,
      `docs/releases has notes for ${missing
        .map((v) => `v${v}`)
        .join(", ")} and CHANGELOG.md has no "## v…" heading for them. ` +
        `The changelog says it is "the short version" of those notes, so a ` +
        `release missing from it reads as a release that did not happen.`,
    ).toEqual([]);
  });

  it("the version in package.json is described somewhere", () => {
    // The other direction: a bump with no notes. This is the one that
    // bites at release time, because the tag is already pushed by the
    // time anyone looks for the notes.
    const v = packageVersion();
    expect(versionsWithNotes(), `no docs/releases/v${v}.md`).toContain(v);
    expect(
      new RegExp(`^## v${v.replace(/\./g, "\\.")}\\b`, "m").test(changelog()),
      `CHANGELOG.md has no "## v${v}" heading`,
    ).toBe(true);
  });

  it("the newest CHANGELOG entry is the current version", () => {
    // Entries are newest-first. If a bump adds its heading in the wrong
    // place the file still contains it and the assertions above pass,
    // while the top of the page shows an older release as the latest.
    const first = changelog().match(/^## v(\d+\.\d+\.\d+)\b/m)?.[1];
    expect(first, "no version headings in CHANGELOG.md").toBeTruthy();
    expect(first).toBe(packageVersion());
  });

  it("the notes link to the diff for the right version", () => {
    // Copying the previous release's notes and editing the prose is the
    // normal way to write these, and the compare link is what gets
    // missed — it then points at a diff that excludes the release it
    // claims to describe.
    const v = packageVersion();
    const notes = readFileSync(join(ROOT, `docs/releases/v${v}.md`), "utf8");
    expect(notes).toContain(`# v${v}`);
    expect(notes, `the diff link in v${v}.md does not end at v${v}`).toMatch(
      new RegExp(`compare/v\\d+\\.\\d+\\.\\d+\\.\\.\\.v${v.replace(/\./g, "\\.")}`),
    );
  });
});
