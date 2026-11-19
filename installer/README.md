# Installers — what is built, and what has actually been run

This directory holds the Windows installer. **Read the verification
status below before trusting any of it**, because the honest answer is
different for each piece.

## Status, as of 19 Nov 2026

| Piece | Verified how |
|---|---|
| `install-prebuilt.sh` (macOS/Linux) | **Tested.** `scripts/install-prebuilt-check.sh` runs it against a local fake release over loopback: 14/14. Installs a valid payload, refuses a plugin-shaped zip, refuses a source-only zip, preserves the database on re-install. |
| `scripts/build-prebuilt-zip.mjs` | **Tested.** Asset names checked against what the shell script computes; both refusal paths (missing `.next`, database inside) exercised. |
| `scripts/zip-write.mjs` | **Tested.** Output verified against `unzip` and against this project's own `zip-read.mjs`. |
| `host/SeoToolHost.cs` | **COMPILES.** `dotnet publish` on `windows-latest` produced `SEO Tool.exe`, and the workflow's own existence check confirmed the file rather than trusting the exit code. The pinned WebView2 SDK `1.0.2903.40` restored from NuGet. **Never RUN** — nobody has double-clicked it. |
| `seo-tool.iss` | **COMPILES.** ISCC 6 built `SEO-Tool-Setup-0.10.1.exe`, 118 MB, inside the 40–600 MB sanity range. Failed on the first attempt (a `SetupIconFile` pointing at a file that never existed); `installer-assets.test.ts` now catches that class in milliseconds. |
| `.github/workflows/installer.yml` | **RUN, all six jobs green.** Run 44553068011: version, three payloads, windows, checksums. Creates no release on a dispatch; the `release` job needs a tag and makes a draft. |
| macOS / Linux payload jobs | **RUN.** All three built, 99 MB each. A macOS payload cannot be built anywhere else: `pnpm install --prod` compiles the native modules for whichever platform it runs on. The Intel leg asked for `macos-13` on the first attempt — retired a year ago — and sat in "queued" forever rather than failing; see `workflow-runners.test.ts`. |
| The asset names | **VERIFIED against the real run.** `SHA256SUMS.txt` lists exactly the three filenames `install-prebuilt.sh` computes for itself. That agreement is the whole install path: the one-liner matches by exact name, so an off-by-one would read as "no prebuilt payload at all". |

So: every piece now compiles, and the artifact names line up end to end.
**Nothing has been installed on a real machine yet.** A build that
compiles and a build that works are different claims, and the checklist
below is the second one.

That is why `installer.yml` still attaches nothing to a published
release. Its `release` job runs only on a tag and produces a **draft** —
`/releases/latest` excludes drafts, so no user and not even
`install-prebuilt.sh` can reach it until a human presses Publish.

## Running it the first time

```
Actions → "Installers" → Run workflow
```

On a dispatch, nothing is released — every job ends in
`upload-artifact`, so the results are private builds on the Actions tab
(the `release` job is skipped: it needs a tag):

| Artifact | What it is |
|---|---|
| `SEO-Tool-Setup-<version>` | the Windows `.exe` |
| `prebuilt-macos-latest` | payload for Apple Silicon |
| `prebuilt-macos-15-intel` | payload for Intel Macs |
| `prebuilt-ubuntu-24.04` | payload for Linux x86_64 |
| `SHA256SUMS` | the checksums `install-prebuilt.sh` verifies |

`fail-fast` is off on the payload matrix, so on a first run one platform
failing still tells you about the others. Download it,
install it on a machine that is **not** the development one, and check:

- [ ] it installs without an admin prompt (`PrivilegesRequired=lowest`)
- [ ] a window opens, dark, with no address bar, and the app loads in it
- [ ] the database lands in `%LOCALAPPDATA%\SEO Tool`, not in Documents
      and not inside the install folder
- [ ] an external link (Google's docs from any issue card) opens in the
      real browser, not inside the app window
- [ ] closing the window leaves no `node.exe` and no headless Chrome
      behind in Task Manager
- [ ] uninstalling removes the program and **keeps** the database
- [ ] reinstalling finds that database again

Expected failures on a first run, so they are not a surprise:

- **The WinForms class name in `[Code]`** is a guess. It is used only to
  warn about installing over a running copy, so a wrong value makes the
  warning never appear — harmless, and worth correcting once the real
  class name is known.
- **The WebView2 SDK version is pinned** to `1.0.2903.40`. If NuGet does
  not have it, the publish step fails loudly, which is the right failure.
- **Trimming is off on purpose.** WinForms and WebView2 both reflect, and
  a trimmed build throws `MissingMethodException` on the user's machine
  rather than in CI. It costs 60–70 MB and is worth it.

## Why the pieces are the way they are

**A native window, not a browser tab.** Without a host, "the app" is a
terminal window plus a tab the user has to keep straight — which reads
as a developer tool you are borrowing. The audience this exists for is
the one that will not open a terminal.

**WebView2, not bundled Chromium.** WebView2 is the Edge runtime already
present on Windows 10 and 11. Bundling a browser would add ~150 MB to an
installer whose whole pitch is being small. The host checks for it first
and gives the download link if it is missing, because that is the one
failure a user cannot diagnose from a stack trace.

**Node is SHA-256 verified** against Node's own `SHASUMS256.txt` in the
workflow. An installer that bundles a runtime it has not checked is an
installer that can be made to ship somebody else's binary. Its version
is pinned to the one the payload's native modules were compiled against:
a mismatch is `ERR_DLOPEN_FAILED` at startup, which reads as a corrupt
download rather than a version problem.

**Per-user install, no elevation.** Nothing here needs Program Files, no
service is registered, no driver is installed. Asking for admin to
install an SEO tool is a prompt people should decline.

**The uninstaller does not delete the database.** It lives in
`%LOCALAPPDATA%\SEO Tool`, which is the user's own work, and
"reinstall to fix it" is a thing people do.

**`%LOCALAPPDATA%`, never Documents.** Measured on a developer machine:
`mkdir` inside `Documents` *hung* past a five-minute timeout, the folder
carrying the ReadOnly attribute — Documents is routinely redirected into
OneDrive and watched by sync and AV filter drivers. LOCALAPPDATA took
2 ms. The same reason backups moved there.

**Port 0, then read back what the OS assigned.** Not "try 3000 and
increment": 3000 is the most contended port in local development, and
"something answered" is not the same as "ours answered" — a lesson this
project already learned from `.seo-port`.

**The whole process tree is killed on close.** The server spawns
Playwright browsers; killing only the parent leaves headless Chrome
running with no way for the user to find it.

## The macOS / Linux one-liner

```bash
curl -fsSL https://raw.githubusercontent.com/IamRamgarhia/All-In-One-Free-SEO-Tool/main/install-prebuilt.sh | bash
```

Fetches the prebuilt payload from the latest release — `node_modules`
installed, `.next` built — so there is no compile step and nothing to go
wrong that the user can do anything about.

`install.sh` is untouched and remains the right choice for contributors
and anyone running unreleased code. It builds from source, which needs
pnpm and a compiler, and on Node 25+ pnpm is frequently absent because
those versions ship no corepack.

**The prebuilt asset does not exist on any release yet** — v0.10.1 and
everything before it carry only the source zip. Until one is published
the script says so and stops, rather than falling back to something it
did not promise.

### Publishing one

The `release` job in `installer.yml` does it, and only on a tag:

```bash
# package.json's version must already BE the tag's version — the payload
# asset is named from package.json while the workflow's version comes
# from the tag, and the one-liner matches by exact name, so a mismatch
# reads as "no prebuilt payload at all". The payload job checks this.
git tag v0.10.2 && git push origin v0.10.2
```

That builds all four downloads and attaches them to a **draft** release
with its install instructions. A draft is the point: `/releases/latest`
excludes drafts, so `install-prebuilt.sh` cannot see it and no user can
reach it until someone presses Publish. Publish *means* the checklist
above has been run on a machine that is not the development one.

The job also:

- **refuses a tag whose release is already published.** `gh release
  upload --clobber` against a live release swaps the bytes behind a link
  people already have, with no version change to notice.
- **re-verifies `SHA256SUMS.txt`** after downloading the artifacts, so
  the file the installer trusts is checked against the bytes actually
  being attached.
- **says what is missing in the draft body.** If the Windows leg failed,
  the draft still carries the payloads and its body says the `.exe` is
  not there — because one dead runner should not block three platforms,
  and because a release missing an advertised download is the kind of
  thing a reader finds before a maintainer does.
- **is the only job in the repository with `contents: write`.**
  `release-draft-gate.test.ts` asserts every one of these, including
  that no second job escalates.

To do it by hand instead:

```bash
node scripts/build-payload.mjs --out dist/payload
node scripts/build-prebuilt-zip.mjs --payload dist/payload --out dist
# one per platform — this only builds for the machine it runs on
gh release upload v0.10.2 dist/seo-tool-prebuilt-*.zip
```

One asset per platform **and per Node major**, because the payload
contains native modules compiled against a single Node ABI: 20 is 115,
22 is 127, 24 is 137, 26 is 147. A node-22 payload unpacked under Node 26
fails at startup with `ERR_DLOPEN_FAILED`, which reads as a corrupt
download rather than a version mismatch — and is the error that broke
this project's own dev machine when its Node moved under an install.

So the Node major is in the filename
(`…-darwin-arm64-node22.zip`), the installer asks for its own, and if
there is no match it **lists what the release does carry** and says to
install one of those versions. `install-prebuilt.sh` also re-checks
`payload.json`'s recorded ABI against the running Node after unpacking,
before anything is overwritten — a correctly-named archive built on the
wrong runtime is the one case the filename cannot catch.

Only Node 22 is built for now: it is the LTS the lockfile's native
modules are routinely built against, and each extra major multiplies the
matrix. Adding 24 is one line in the workflow.
