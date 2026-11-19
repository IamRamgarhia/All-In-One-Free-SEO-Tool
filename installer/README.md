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
| `host/SeoToolHost.cs` | **NEVER COMPILED.** No .NET SDK on the machine it was written on. |
| `seo-tool.iss` | **NEVER COMPILED.** No Inno Setup on that machine either. |
| `.github/workflows/installer.yml` | **NEVER RUN.** |

So: the Mac/Linux one-liner is real and tested. **The Windows `.exe` is
written and unproven.** Its first CI run is the first evidence any of it
works, and there is no reason to expect a three-part build — C# host,
portable Node, Inno Setup — to work first time.

That is also why `installer.yml` is deliberately **not** wired into the
release workflow. Attaching an unverified installer to a release puts it
in front of users before anybody has double-clicked it once.

## Running it the first time

```
Actions → "Windows installer" → Run workflow
```

It uploads `SEO-Tool-Setup-<version>.exe` as an artifact. Download it,
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

**The prebuilt asset does not exist on any release yet.** Until one is
published the script says so and stops, rather than falling back to
something it did not promise. To publish one:

```bash
node scripts/build-payload.mjs --out dist/payload
node scripts/build-prebuilt-zip.mjs --payload dist/payload
# attach dist/seo-tool-prebuilt-<version>-<os>-<arch>.zip to the release
```

One asset per platform, because the payload contains native modules
compiled for one OS, one architecture and one Node ABI.
