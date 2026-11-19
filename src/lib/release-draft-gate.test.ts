/**
 * The release job must never touch a PUBLISHED release.
 *
 * WHY: `installer.yml`'s `release` job uploads the Windows `.exe` and
 * the three prebuilt payloads to a GitHub release, because that is the
 * only place the macOS/Linux one-liner can see them — it asks the API
 * for the latest release and matches an asset by exact name. Artifacts
 * on the Actions tab are invisible to it.
 *
 * Which makes this the one job in the repository that can hand a
 * download to every user at once, and the damage runs both ways:
 *
 *   - `gh release upload --clobber` against a PUBLISHED release swaps
 *     the bytes behind a link people already have, with no version
 *     change to notice.
 *   - `gh release create` without `--draft` publishes an installer that
 *     nobody has double-clicked. installer/README.md exists because a
 *     three-part Windows build — C# host, portable Node, Inno Setup —
 *     had never been compiled anywhere until a CI run compiled it, and
 *     the first run failed.
 *
 * `/releases/latest` excludes drafts, so a draft reaches nobody until a
 * human presses Publish. These assertions are cheap and the mistake
 * they prevent is not reversible: once a release asset has been
 * downloaded, it has been downloaded.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOW = join(process.cwd(), ".github/workflows/installer.yml");

/** The `release:` job's block, by indentation. */
function releaseJob(): string {
  const src = readFileSync(WORKFLOW, "utf8");
  const start = src.indexOf("\n  release:");
  expect(start, "no `release:` job in installer.yml").toBeGreaterThan(-1);
  // The next top-level job, or end of file.
  const after = src.slice(start + 1);
  const next = after.search(/\n {2}[a-z][a-z0-9_-]*:\n/);
  return next === -1 ? after : after.slice(0, next);
}

describe("the installer release job", () => {
  const job = releaseJob();

  it("has the steps that do the uploading, or this test proves nothing", () => {
    // Guard against a vacuous pass: if the block extraction broke, every
    // "does not contain" assertion below would trivially hold.
    expect(job).toContain("gh release");
    expect(job.length).toBeGreaterThan(500);
  });

  it("runs only on a version tag", () => {
    // Without this, every push to main would attach assets to whatever
    // release the tag resolution happened to pick.
    expect(job).toContain("startsWith(github.ref, 'refs/tags/v')");
  });

  it("creates drafts only", () => {
    // Every `gh release create` must carry --draft. Checked per
    // occurrence rather than "the word --draft appears somewhere",
    // because a second create added later would otherwise inherit the
    // first one's flag by proximity alone.
    const creates = [...job.matchAll(/gh release create[\s\S]{0,400}?(?=\n\s*(?:echo|fi|gh |- |$))/g)];
    expect(creates.length).toBeGreaterThanOrEqual(1);
    for (const c of creates) {
      expect(c[0], `a \`gh release create\` without --draft:\n${c[0]}`).toContain("--draft");
    }
  });

  it("refuses a release that is already published", () => {
    // The check is on isDraft, and the refusal must EXIT. A warning that
    // carries on would still clobber the assets.
    expect(job).toContain("isDraft");
    expect(job).toMatch(/already PUBLISHED[\s\S]{0,120}exit 1/);
  });

  it("never marks a release as latest or publishes one", () => {
    // `--latest` on a draft is meaningless, and on anything else it is
    // the flag that puts a build in front of every one-liner at once.
    expect(job).not.toContain("--latest");
    expect(job).not.toMatch(/gh release edit[^\n]*--draft=false/);
    expect(job).not.toMatch(/gh api[^\n]*releases/);
  });

  it("is the only job that can write to the repository", () => {
    const src = readFileSync(WORKFLOW, "utf8");
    // Workflow-level default stays read-only; the escalation is local to
    // this one job, so a step added to `payload` or `windows` cannot
    // push a tag or edit a release.
    expect(src).toMatch(/^permissions:\n\s+contents: read$/m);
    const writes = [...src.matchAll(/contents: write/g)];
    expect(writes.length, "more than one job escalates to contents: write").toBe(1);
    expect(job).toContain("contents: write");
  });

  it("refuses a draft carrying a payload with no checksum", () => {
    // MEASURED: GitHub lost the macOS-arm64 runner mid-run, so that leg
    // was cancelled while the other two rebuilt. The job uploaded the
    // two it had, plus a SHA256SUMS.txt covering only those two — and
    // left the draft holding THREE payloads, one of them the stale
    // 407 MB uncompressed build from the previous run with no checksum
    // line.
    //
    // install-prebuilt.sh treats a missing checksum as non-fatal, by
    // design, because older releases have none. So an Apple Silicon
    // user would have installed an old build with nothing verifying it
    // and no indication anything was wrong.
    //
    // A partial draft is fine. A draft that cannot verify what it
    // carries is not.
    expect(job).toContain("SHA256SUMS.txt");
    expect(job, "the check must read the DRAFT's assets, not the run's output").toMatch(
      /gh release view[^\n]*assets[\s\S]{0,200}seo-tool-prebuilt-/,
    );
    expect(job).toMatch(/no line in SHA256SUMS\.txt[\s\S]{0,600}exit 1/);
  });

  it("refuses to publish an empty draft, and verifies what it attaches", () => {
    // A draft with no assets reads as a release that failed to build;
    // and the payloads are what the one-liner trusts SHA256SUMS.txt for,
    // so attaching one without the other is worse than attaching
    // neither.
    expect(job).toMatch(/nothing was built[\s\S]{0,120}exit 1/);
    expect(job).toContain("sha256sum -c SHA256SUMS.txt");
    expect(job).toMatch(/payloads exist but SHA256SUMS\.txt does not[\s\S]{0,120}exit 1/);
  });
});
