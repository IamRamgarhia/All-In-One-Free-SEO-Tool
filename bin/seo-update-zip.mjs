#!/usr/bin/env node
/**
 * Update an install that was NOT cloned with git.
 *
 * WHY THIS EXISTS
 *
 * The README leads with a download, the launcher exists so that someone
 * who does not use a terminal can run this, and `bin/seo-update.cjs`
 * then refuses them:
 *
 *     This install is not a git repository (ZIP installer was used).
 *     To upgrade, re-run the installer one-liner from your README
 *
 * — a `curl | bash` line, offered to the person whose entire interface
 * is a window with buttons in it. So the headline install could never be
 * updated, and the Update button in the control panel was a dead end for
 * exactly the audience the launcher was built for.
 *
 * WHY NOT JUST RUN install.ps1
 *
 * It already knows how to refresh in place, and reusing it was the first
 * plan. Two things make it the wrong tool:
 *
 *   - `$dir` defaults to `$HOME\seo`, not the folder it is run from. An
 *     install anywhere else gets a SECOND copy, with its own empty
 *     database, and a success message.
 *   - It picks Docker when Docker Desktop is running. On a machine where
 *     Docker was installed for something else, "update" would migrate a
 *     working native install onto an empty volume and the user's data
 *     would appear to vanish.
 *
 * Both are reasonable for a first install and wrong for an update.
 *
 * WHAT THIS DOES
 *
 *   1. Refuses on a git checkout — that is seo-update.cjs's job.
 *   2. Asks GitHub for the latest RELEASE, not the tip of main. A branch
 *      zip would hand someone unreleased code with no changelog.
 *   3. Stops if the installed version is already at or past it.
 *   4. Downloads, unpacks to a temp folder, and VALIDATES before
 *      touching anything: a truncated download must not half-overwrite
 *      an app that currently works.
 *   5. Copies over, never deleting. Everything `shouldKeep` matches stays.
 *   6. Refreshes the launchers that sit above `_system/`.
 *   7. Removes .next, so a stale build cannot serve the old code while
 *      reporting the new version.
 *
 * It deliberately does NOT install dependencies, migrate or build. The
 * launcher's Start does all three when `.next/BUILD_ID` is missing,
 * which it now is — one code path for "bring this up to date", already
 * tested, instead of a second one here.
 *
 * The judgements worth testing live in scripts/update-plan.mjs.
 *
 * Usage:  node bin/seo-update-zip.mjs [--check]
 *         --check  report what would happen, change nothing
 */

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commonPrefix, extractZip } from "../scripts/zip-read.mjs";
import { compareVersions, repoSlug, shouldKeep } from "../scripts/update-plan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CHECK_ONLY = process.argv.includes("--check");

function say(msg = "") {
  process.stdout.write(`  ${msg}\n`);
}

function die(msg) {
  process.stdout.write(`\n  ${msg}\n\n`);
  process.exit(1);
}

/**
 * Copy the staged release over the install, file by file, skipping
 * anything the user owns.
 *
 * Not a directory-level copy: `cpSync(stage, ROOT, { recursive: true })`
 * would walk straight through `public/` and overwrite `public/uploads/`,
 * because the exclusion has to be decided per file rather than per
 * top-level folder.
 */
function copyOver(from, to, rel = "") {
  let copied = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (shouldKeep(childRel)) continue;
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyOver(src, dest, childRel);
    } else {
      cpSync(src, dest, { force: true });
      copied++;
    }
  }
  return copied;
}

async function main() {
  say();
  say("SEO Tool — update");
  say();

  if (existsSync(join(ROOT, ".git"))) {
    die(
      "This is a git checkout, so `node bin/seo-update.cjs` is the right\n" +
        "  updater for it — it pulls commits rather than replacing files.",
    );
  }

  const pkgPath = join(ROOT, "package.json");
  if (!existsSync(pkgPath)) die(`No package.json in ${ROOT} — is this the app folder?`);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const slug = repoSlug(pkg);
  if (!slug) {
    die(
      "package.json has no GitHub repository url, so there is nowhere to\n" +
        "  check for updates. Download the latest zip manually instead.",
    );
  }
  const installed = pkg.version;

  say(`Installed version: ${installed}`);
  say(`Checking ${slug} for a newer release…`);

  let release;
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, {
      headers: {
        "user-agent": "seo-tool-updater",
        accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    release = await res.json();
  } catch (e) {
    die(
      `Could not reach GitHub (${e.message}).\n` +
        "  Check your internet connection and try again — nothing has been changed.",
    );
  }

  const latest = release.tag_name ?? "";
  say(`Latest release:    ${latest}`);

  const cmp = compareVersions(installed, latest);
  if (cmp === null) {
    say();
    say(`Could not compare "${installed}" with "${latest}", so this will not`);
    say("guess. Download the latest zip manually if you believe it is newer.");
    process.exit(1);
  }
  if (cmp >= 0) {
    say();
    say("Already up to date. Nothing to do.");
    process.exit(0);
  }

  // Prefer a release asset — that is the zip with the launchers in it,
  // the one the README tells people to download. The source zipball
  // GitHub attaches to every release is the fallback.
  const asset = (release.assets ?? []).find(
    (a) => typeof a.name === "string" && a.name.endsWith(".zip"),
  );
  const url = asset?.browser_download_url ?? release.zipball_url;
  if (!url) die("That release has no zip to download.");

  if (CHECK_ONLY) {
    say();
    say(`An update to ${latest} is available (${asset?.name ?? "source zip"}).`);
    say("Run without --check to apply it.");
    process.exit(0);
  }

  say();
  say(`Downloading ${asset?.name ?? "source zip"}…`);
  let buf;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "seo-tool-updater" },
      redirect: "follow",
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`download answered ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    die(`Download failed (${e.message}). Nothing has been changed.`);
  }
  say(`Downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MB`);

  const stage = mkdtempSync(join(tmpdir(), "seo-update-"));
  try {
    // Unpack and VALIDATE before touching the install. A truncated
    // download that half-overwrites a working app is the one outcome
    // worse than not updating at all.
    say("Unpacking…");
    const prefix = commonPrefix(buf);
    extractZip(buf, stage, { strip: prefix ? 1 : 0 });

    // The release zip puts the project under _system/; a source zipball
    // puts it at the (stripped) root. Find package.json rather than
    // assuming either.
    const payload = [stage, join(stage, "_system")].find((d) =>
      existsSync(join(d, "package.json")),
    );
    if (!payload) {
      die(
        "The downloaded archive does not look like this app — no\n" +
          "  package.json inside it. Nothing has been changed.",
      );
    }
    const newPkg = JSON.parse(readFileSync(join(payload, "package.json"), "utf8"));
    if (newPkg.name !== pkg.name) {
      die(
        `The archive contains "${newPkg.name}", not "${pkg.name}".\n` +
          "  Nothing has been changed.",
      );
    }
    // Things the app cannot run without. If the archive is missing one,
    // it is not a release — it is a bad download.
    for (const required of ["src", "scripts", "bin"]) {
      if (!existsSync(join(payload, required))) {
        die(`The archive has no ${required}/ folder. Nothing has been changed.`);
      }
    }
    say(`Archive looks right (${newPkg.name} ${newPkg.version}).`);

    say("Applying…");
    const copied = copyOver(payload, ROOT);
    say(`Updated ${copied} files. Your database and settings were not touched.`);

    /**
     * The launchers live one level ABOVE the app.
     *
     * A release unpacks as `SEO Tool - WINDOWS.hta` + `READ ME FIRST.txt`
     * beside a `_system/` folder holding the project, so package.json —
     * and therefore ROOT — is `_system`. Copying only the payload leaves
     * the launchers frozen at whatever version was first downloaded,
     * which is how someone ends up running an old .hta against a current
     * app and hitting a bug that was fixed long ago. They are also the
     * files most likely to need a fix, being the first thing that runs.
     *
     * Guarded twice: only when this install really is a `_system` folder,
     * and only for the launcher files themselves — never a blanket copy
     * into a parent directory whose contents are not ours.
     */
    if (payload !== stage && basename(ROOT) === "_system") {
      const parent = dirname(ROOT);
      let refreshed = 0;
      for (const entry of readdirSync(stage, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        if (!/\.(hta|command|sh|txt)$/i.test(entry.name)) continue;
        cpSync(join(stage, entry.name), join(parent, entry.name), { force: true });
        refreshed++;
      }
      if (refreshed > 0) say(`Refreshed ${refreshed} launcher files next to _system.`);
    }

    // A stale production build would serve the OLD code while
    // package.json reports the new version — a wrong answer that looks
    // like a successful update. bin/START.* rebuilds when BUILD_ID is
    // missing, so remove it and let the existing path do the work.
    const next = join(ROOT, ".next");
    if (existsSync(next)) {
      rmSync(next, { recursive: true, force: true });
      say("Removed the old build — Start will rebuild it (a minute or two).");
    }

    // Leave a breadcrumb for support: which version replaced which.
    try {
      writeFileSync(
        join(ROOT, ".seo-last-update"),
        `${new Date().toISOString()} ${installed} -> ${newPkg.version}\n`,
        "utf8",
      );
    } catch {
      /* not worth failing an otherwise-good update over */
    }

    say();
    say(`Updated to ${newPkg.version}.`);
    say("Press Start to bring the app back up.");
    say();
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

main().catch((e) => {
  die(`Something went wrong: ${e.message}`);
});
