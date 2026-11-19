/**
 * Packages the prebuilt payload as a release asset.
 *
 * The macOS/Linux one-liner (install-prebuilt.sh) fetches this instead
 * of building from source, which is the difference between "install
 * Node, pnpm, a compiler, then wait" and "one command". It looks the
 * asset up BY EXACT NAME, so the name is owned here and nowhere else —
 * the same reason releaseAssetName() exists in update-plan.mjs, and the
 * same bug it was written for: v0.10.0's updater took the first asset
 * ending in .zip, which is the 30 KB WordPress plugin, and replaced
 * people's installs with it.
 *
 *   node scripts/build-prebuilt-zip.mjs [--payload dist/payload] [--out dist]
 *
 * Platform-specific on purpose. The payload contains compiled native
 * modules (better-sqlite3, @resvg/resvg-js) built for one OS, one
 * architecture and one Node ABI; a single "universal" asset would fail
 * at startup with ERR_DLOPEN_FAILED on everything it was not built on.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeZip } from "./zip-write.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const argOf = (name) => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) return next;
  }
  return undefined;
};

/**
 * The asset name, owned here.
 *
 * `uname -s | tr A-Z a-z` and `uname -m` are what install-prebuilt.sh
 * uses, so these must agree: darwin/linux, and arm64/x86_64. Node's
 * own `process.platform` and `process.arch` use different words
 * ("x64", not "x86_64"), which is exactly the kind of near-miss that
 * produces a 404 nobody can explain.
 */
export function prebuiltAssetName(version, platform = process.platform, arch = process.arch) {
  const os = platform === "darwin" ? "darwin" : platform === "win32" ? "win32" : "linux";
  const machine = arch === "arm64" ? "arm64" : arch === "x64" ? "x86_64" : arch;
  return `seo-tool-prebuilt-${String(version).replace(/^v/, "")}-${os}-${machine}.zip`;
}

async function main() {
  const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const payload = resolve(ROOT, argOf("payload") || "dist/payload");
  const outDir = resolve(ROOT, argOf("out") || "dist");

  if (!existsSync(payload)) {
    console.error(
      `No payload at ${payload}.\n` +
        `Build one first:  node scripts/build-payload.mjs --out dist/payload`,
    );
    process.exit(1);
  }

  // The same three things install-prebuilt.sh validates after
  // downloading. Checked here too, because an asset that fails that
  // validation is one every user downloads before finding out.
  for (const required of ["server.js", "node_modules", ".next"]) {
    if (!existsSync(join(payload, required))) {
      console.error(
        `${payload} is missing ${required} — that is not a prebuilt payload.\n` +
          `The installer refuses archives like this, so publishing one would ` +
          `ship a download that cannot install.`,
      );
      process.exit(1);
    }
  }

  // Last gate before an artefact anyone can download. build-payload
  // already scans and deletes on a hit; this is belt and braces,
  // because build output has carried the maintainer's live database
  // once already.
  const privateHit = findPrivate(payload);
  if (privateHit) {
    console.error(`Refusing to package: found ${privateHit} inside the payload.`);
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const name = prebuiltAssetName(version);
  const out = join(outDir, name);

  process.stdout.write(`  packaging ${payload}\n`);
  const r = await writeZip(payload, out);
  const mb = (statSync(out).size / 1048576).toFixed(0);
  process.stdout.write(`  wrote ${name} — ${r.entries} files, ${mb} MB\n`);

  // A plausible range, not an exact number: too small means the payload
  // did not make it in, too large means something unintended did.
  if (Number(mb) < 40) {
    console.error(`  ${mb} MB is too small to be the app — check the payload.`);
    process.exit(1);
  }
}

function findPrivate(dir) {
  // readdirSync imported at the top: `require` is not available in an
  // ESM module, so the first version of this threw ReferenceError the
  // moment a payload was scanned — i.e. on every real run, never in a
  // name-only test.
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "backups" || e.name === ".git") return full;
        stack.push(full);
        continue;
      }
      if (/\.db(-wal|-shm)?$|^\.env($|\.)/.test(e.name)) return full;
    }
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("build-prebuilt-zip.mjs")) {
  await main();
}
