#!/usr/bin/env node
/**
 * Build the prebuilt payload: an app that runs the moment it is unpacked.
 *
 *   node scripts/build-payload.mjs [--out dist/payload] [--skip-build]
 *
 * WHY THIS EXISTS
 *
 * The release ZIP ships source only — 3.7 MB, no node_modules, no .next.
 * First run therefore does `pnpm install` and a full Next build: minutes,
 * a network connection, and a working toolchain, on a machine whose owner
 * downloaded a thing with a Desktop icon. It is also where the Node-ABI
 * breakage lives, because better-sqlite3 gets compiled against whatever
 * Node happens to be installed that day.
 *
 * A prebuilt payload moves all of that to our build machine. The person
 * downloading gets a folder that starts.
 *
 * WHY AN ALLOWLIST
 *
 * `.next/standalone` is produced by Next's file tracer, and on 19 Nov 2026
 * it contained `backups/` — seven copies of the live SQLite database —
 * plus `.git`, `dist` and `e2e`. next.config.ts now excludes those, but
 * the exclude globs are nft's to interpret and two of them silently did
 * not match. So this script never copies a directory wholesale: it takes
 * named things, and then refuses outright if a scan finds anything
 * private in what it assembled. Two independent mechanisms have to fail
 * before somebody's database leaves this folder.
 *
 * WHY IT RECORDS THE PLATFORM AND ABI
 *
 * better-sqlite3 and @resvg/resvg-js are native. A payload built on
 * Windows under Node 22 does not run on Linux, and does not run under
 * Node 26 either — it fails with ERR_DLOPEN_FAILED, which tells the
 * reader nothing. payload.json carries the platform, arch and
 * NODE_MODULE_VERSION it was built for so the launcher can say
 * "this copy was built for Windows x64 and Node 22" instead.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/**
 * Reads `--name=value` AND `--name value`.
 *
 * It only read the `=` form, while this file's own usage line two dozen
 * lines up documents the space form: `[--out dist/payload]`. So
 * `--out dist/installer-payload` was silently ignored and the payload
 * went to the default `dist/payload` — and the caller, which then looks
 * for it where it asked for it, finds an empty directory.
 *
 * Found while writing the installer workflow, which passed the
 * documented form. It would have produced an installer with no app
 * inside it, and the only symptom would have been a suspiciously small
 * .exe.
 */
const argOf = (name) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) {
    const next = process.argv[i + 1];
    // A following flag means the value is missing, not that the flag is
    // the value.
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
};
const OUT = resolve(ROOT, argOf("out") || "dist/payload");
const SKIP_BUILD = process.argv.includes("--skip-build");

const say = (m) => process.stdout.write(`  ${m}\n`);
const die = (m) => {
  process.stderr.write(`\n  x ${m}\n\n`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/**
 * Everything the payload contains, named one by one.
 *
 * `from` is relative to the project; `to` is relative to the payload.
 * A directory here is copied whole, so nothing in this list may be a
 * directory that can contain user data — which is what the scan below
 * double-checks.
 */
const COPY = [
  // Next's standalone server entry and the compiled server output.
  //
  // NOT .next/standalone/node_modules. That directory is pnpm's
  // symlinked tree as the tracer left it: `next` is a symlink into
  // .pnpm/next@<hash>/node_modules/next, and its dependencies are
  // siblings inside that same folder. Copying it flattens the symlinks
  // and every one of those siblings stops resolving — first `bindings`,
  // then `@swc/helpers`, each surfacing only when the server reached the
  // line that needed it. A real `pnpm install` produces a tree that
  // works, which is a thing package managers are better at than a copy
  // loop in this file.
  { from: ".next/standalone/server.js", to: "server.js", required: true },
  { from: ".next/standalone/.next", to: ".next", required: true },
  // Client assets — these live outside standalone and Next expects them
  // at .next/static. Leaving them out gives a page with no CSS and no JS,
  // which looks like a broken app rather than a missing copy step.
  { from: ".next/static", to: ".next/static", required: true },
  { from: "public", to: "public", required: false },
  // The migration runner and the SQL it applies. scripts/migrate.cjs is
  // the only runner (db:migrate, predev, prebuild, the Docker entrypoint);
  // it reads every .sql in filename order.
  { from: "scripts/migrate.cjs", to: "scripts/migrate.cjs", required: true },
  { from: "src/db/migrations", to: "src/db/migrations", required: true },
];

/** Never allowed in the payload, at any depth. */
const FORBIDDEN_DIR = new Set([
  "backups",
  ".git",
  ".e2e",
  "dist",
  "e2e",
  "test-results",
  "playwright-report",
]);
const FORBIDDEN_FILE =
  /(^data\.db($|[-.]))|(\.db$)|(\.db-wal$)|(\.db-shm$)|(^\.env$)|(^\.env\..+)/;

/** Walk the assembled payload and refuse if anything private is in it. */
function scanForPrivateFiles(dir) {
  const hits = [];
  const walk = (d, depth) => {
    if (depth > 8 || hits.length > 40) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      const rel = relative(dir, full).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (FORBIDDEN_DIR.has(e.name)) {
          hits.push(`${rel}/  (forbidden directory)`);
          continue;
        }
        // node_modules is large and holds nothing of ours; a .db inside
        // a dependency is that dependency's fixture, not user data.
        if (e.name === "node_modules") continue;
        walk(full, depth + 1);
      } else if (FORBIDDEN_FILE.test(e.name)) {
        hits.push(rel);
      }
    }
  };
  walk(dir, 0);
  return hits;
}

function dirSizeMb(dir) {
  let total = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        try {
          total += statSync(full).size;
        } catch {
          /* raced with something; size is advisory */
        }
      }
    }
  };
  walk(dir);
  return Math.round(total / (1024 * 1024));
}

console.log(`\n  Payload builder — v${pkg.version}\n`);

if (!SKIP_BUILD) {
  say("Building the app (next build)...");
  execFileSync("npx", ["pnpm@10.34.5", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
}

if (!existsSync(join(ROOT, ".next/standalone"))) {
  die(
    'No .next/standalone. next.config.ts must keep output: "standalone", ' +
      "and the build must have run.",
  );
}

say(`Staging into ${relative(ROOT, OUT) || OUT}...`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const item of COPY) {
  const src = join(ROOT, item.from);
  if (!existsSync(src)) {
    if (item.required) die(`Missing ${item.from} — the payload would not run.`);
    continue;
  }
  const dest = join(OUT, item.to);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

/**
 * Install production dependencies into the payload for real.
 *
 * `--node-linker=hoisted` is the whole point: it writes a flat,
 * npm-shaped node_modules with no symlinks and no .pnpm store, which is
 * the only shape that survives being zipped up, moved to another
 * machine and unpacked somewhere else.
 *
 * `--prod` drops devDependencies, which is also what keeps `shadcn` and
 * its express/ts-morph tail out of what we ship.
 */
say("Installing production dependencies (hoisted, no symlinks)...");
for (const f of ["package.json", "pnpm-lock.yaml", ".npmrc", "pnpm-workspace.yaml"]) {
  const src = join(ROOT, f);
  if (existsSync(src)) cpSync(src, join(OUT, f));
}
try {
  execFileSync(
    "npx",
    [
      "pnpm@10.34.5",
      "install",
      "--prod",
      // NOT --no-optional. Combined with --prod it makes pnpm reject the
      // lockfile over an unrelated peer entry:
      //   ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY  no entry for '@types/react'
      // The optional Ads add-on is removed by prunePayload() instead,
      // which is the same mechanism already used for the SWC compiler and
      // does not depend on how the resolver feels about peers.
      "--frozen-lockfile",
      "--node-linker=hoisted",
      "--ignore-workspace",
      "--dir",
      OUT,
    ],
    { cwd: OUT, stdio: "inherit", shell: true },
  );
} catch (err) {
  die(`Installing production dependencies failed: ${err.message}`);
}

// The refusal. Two mechanisms (next.config.ts excludes, and this
// allowlist) have to both fail before this fires — which is the point.
const leaked = scanForPrivateFiles(OUT);
if (leaked.length > 0) {
  rmSync(OUT, { recursive: true, force: true });
  die(
    `The payload contained files that must never ship:\n` +
      leaked.map((h) => `      ${h}`).join("\n") +
      `\n\n    Nothing was written — ${relative(ROOT, OUT)} has been removed.`,
  );
}

/**
 * Prove the payload can do the two things it cannot start without:
 * open a SQLite database, and load the browser driver.
 *
 * A build-time crash here is worth a great deal more than a runtime one
 * on somebody else's computer, where the message is
 * "Cannot find module 'bindings'" and the reader has no way to act on it.
 */
function verifyPayloadLoads() {
  const probe = [
    "const db = require('better-sqlite3')(':memory:');",
    "db.prepare('create table t (a int)').run();",
    "db.prepare('insert into t values (1)').run();",
    "if (db.prepare('select a from t').get().a !== 1) throw new Error('sqlite round-trip failed');",
    "db.close();",
    "require('playwright');",
    "process.stdout.write('probe-ok');",
  ].join("");
  try {
    const out = execFileSync(process.execPath, ["-e", probe], {
      cwd: OUT,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (!out.includes("probe-ok")) throw new Error(`unexpected probe output: ${out}`);
  } catch (err) {
    const detail = String(err.stderr || err.message || err).split("\n").slice(0, 6).join("\n      ");
    die(
      `The payload cannot load its own native modules:\n      ${detail}\n\n` +
        `    This payload would fail on first run, in the migration step, ` +
        `before showing a single page.`,
    );
  }
}

/**
 * Drop what a running app never reads.
 *
 * Measured on this payload: source maps 142 MB, TypeScript definitions
 * 79 MB, and @next/swc-win32-x64-msvc 105 MB. SWC is the compiler Next
 * uses to BUILD; a payload ships a build that is already done, which is
 * why `output: standalone` leaves it out of its own tracing too.
 *
 * Everything removed here is verified afterwards by starting the server
 * and fetching real pages — a size optimisation that breaks the product
 * is not an optimisation, and the only way to know is to run it.
 */
function prunePayload() {
  const nm = join(OUT, "node_modules");
  let bytes = 0;
  const dropFile = (p) => {
    try {
      bytes += statSync(p).size;
      rmSync(p, { force: true });
    } catch {
      /* advisory */
    }
  };
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js\.map|d\.ts|d\.ts\.map|d\.mts|d\.cts)$/.test(e.name)) {
        dropFile(full);
      }
    }
  };
  walk(nm);

  /**
   * The optional Google Ads add-on.
   *
   * `google-ads-node` is a 120 MB generated protobuf bundle — a quarter
   * of the payload — behind an integration gated on three credentials
   * most installs never set, and whose availability to new applicants is
   * in question (issue #57). src/lib/google-ads.ts imports it on demand
   * and explains how to add it when it is absent, so removing it costs
   * a sentence rather than a crash.
   */
  for (const name of ["google-ads-api", "google-ads-node"]) {
    const dir = join(nm, name);
    if (!existsSync(dir)) continue;
    const measure = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const f = join(d, e.name);
        if (e.isDirectory()) measure(f);
        else
          try {
            bytes += statSync(f).size;
          } catch {
            /* advisory */
          }
      }
    };
    try {
      measure(dir);
    } catch {
      /* advisory */
    }
    rmSync(dir, { recursive: true, force: true });
  }

  // The SWC native compiler, per platform. Build-time only.
  const scoped = join(nm, "@next");
  if (existsSync(scoped)) {
    for (const name of readdirSync(scoped)) {
      if (!name.startsWith("swc-")) continue;
      const dir = join(scoped, name);
      const measure = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const f = join(d, e.name);
          if (e.isDirectory()) measure(f);
          else
            try {
              bytes += statSync(f).size;
            } catch {
              /* advisory */
            }
        }
      };
      try {
        measure(dir);
      } catch {
        /* advisory */
      }
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return Math.round(bytes / (1024 * 1024));
}

const savedMb = prunePayload();
say(
  `Pruned ${savedMb} MB — source maps, type definitions, the SWC compiler ` +
    `and the optional Google Ads add-on`,
);

say("Checking the payload can open a database and load Playwright...");
verifyPayloadLoads();
say("  ok");

/**
 * What this payload is, and what it needs to run.
 *
 * `nodeModuleVersion` is the thing that actually matters: it is the ABI
 * the native modules in here were compiled against. A launcher comparing
 * it with process.versions.modules can say "this needs Node 22, you have
 * Node 26" instead of letting better-sqlite3 throw ERR_DLOPEN_FAILED.
 */
const manifest = {
  name: pkg.name,
  version: pkg.version,
  builtAt: new Date().toISOString(),
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.version,
  nodeModuleVersion: process.versions.modules,
  // Not bundled, downloaded on first use — see the installer docs. Named
  // here so the launcher knows which version to fetch.
  playwrightVersion: pkg.dependencies?.playwright ?? null,
};
writeFileSync(join(OUT, "payload.json"), JSON.stringify(manifest, null, 2) + "\n");

say(`Platform : ${manifest.platform}-${manifest.arch}`);
say(`Node ABI : ${manifest.nodeModuleVersion} (built on ${manifest.nodeVersion})`);
say(`Size     : ${dirSizeMb(OUT)} MB`);
say(`Wrote    : ${OUT}`);
console.log("");
