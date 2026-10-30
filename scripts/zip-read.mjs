/**
 * Just enough zip handling to inspect and unpack an archive without
 * spawning a process.
 *
 * WHY NOT `tar` OR `unzip`
 *
 * Two reasons, and both were paid for. `plugin-zip.test.ts` shelled out
 * to `tar` and became the only test in the suite that forks a child
 * process — which made it the only one that could fail from machine load
 * rather than from a real defect. It did, twice, both just after heavy
 * disk work.
 *
 * The second reason is the updater. `bin/seo-update-zip.mjs` unpacks a
 * release on a stranger's machine, and the tools are not reliably there:
 * bsdtar ships with Windows 10+ and macOS, GNU tar on Linux does NOT
 * read zip at all, and `unzip` is not installed by default on many
 * distributions. An updater that cannot unpack is an install that can
 * never be updated — which is the exact hole this is being written to
 * close, so it must not depend on luck.
 *
 * Reads the central directory, which is the authoritative index: the
 * local headers can disagree with it, and unpackers trust the central
 * directory. Supports stored (method 0) and deflated (method 8), which
 * is everything these archives contain.
 *
 * Not a general zip library: no zip64, no encryption, no multi-disk.
 * Those throw rather than returning something plausible.
 *
 * `src/lib/zip-read.ts` is a typed re-export of this file, so the tests
 * and the updater share one implementation rather than two that drift.
 */
import { inflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** Find the end-of-central-directory record, scanning back over any comment. */
function findEocd(buf) {
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Not a zip file: no end-of-central-directory record");
}

export function listZipEntries(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const p0 = buf.readUInt32LE(eocd + 16);

  if (count === 0xffff || p0 === 0xffffffff) {
    throw new Error("zip64 archives are not supported here");
  }

  let p = p0;
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CD_SIG) {
      throw new Error(`Corrupt central directory at entry ${i}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    // Names are bytes. Decoded as UTF-8 because that is what every
    // modern writer emits, and because the only thing we assert about
    // them is their shape.
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    out.push({ name, compressedSize, uncompressedSize, method, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** The decompressed bytes of one entry, by exact name. */
export function readZipEntry(buf, name) {
  const entry = listZipEntries(buf).find((e) => e.name === name);
  if (!entry) throw new Error(`No entry named ${name} in the archive`);
  return inflateEntry(buf, entry);
}

function inflateEntry(buf, entry) {
  const p = entry.localHeaderOffset;
  if (buf.readUInt32LE(p) !== LFH_SIG) {
    throw new Error(`Corrupt local header for ${entry.name}`);
  }
  // The local header's own name/extra lengths, which can differ from
  // the central directory's extra field.
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
}

/**
 * Reject an entry name that would write outside the destination.
 *
 * "Zip slip": an archive can name an entry `../../../.ssh/authorized_keys`
 * or `C:\Windows\x`, and a naive unpacker writes exactly there. The
 * updater unpacks a file downloaded over the network, so this is the
 * one place in this codebase where that is a live concern rather than a
 * theoretical one. Resolved paths are compared, not strings, because
 * `a/../../b` only reveals itself after resolution.
 */
export function safeJoin(destDir, name) {
  // Backslashes are a legal character in a zip name, and PowerShell's
  // Compress-Archive writes separators as backslashes — so on every
  // platform they are treated as separators here, or `a\..\..\b` would
  // slip past the check on Linux.
  const normalised = String(name).replace(/\\/g, "/");
  if (normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised)) {
    throw new Error(`Refusing absolute path in archive: ${name}`);
  }
  const base = resolve(destDir);
  const target = resolve(base, normalised);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Refusing path outside the destination: ${name}`);
  }
  return target;
}

/**
 * Unpack every file into `destDir`.
 *
 * @param strip how many leading path segments to drop. GitHub wraps its
 *              archives in a single top folder (`repo-main/`), so 1 is
 *              the usual value; entries with fewer segments are skipped.
 * @returns the number of files written
 */
export function extractZip(buf, destDir, { strip = 0 } = {}) {
  let written = 0;
  for (const entry of listZipEntries(buf)) {
    const normalised = entry.name.replace(/\\/g, "/");
    // Directory entries carry a trailing slash and no content. The
    // directories get created from the file paths anyway.
    if (normalised.endsWith("/")) continue;

    // Checked HERE, before the segments are split and emptied below.
    // `filter(Boolean)` discards the leading empty segment of an
    // absolute name, so `/etc/passwd` would arrive at safeJoin as
    // `etc/passwd` and be quietly written inside the destination
    // instead of refused. Contained, but a lie: the archive asked for
    // something this did not do and did not say so.
    if (normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised)) {
      throw new Error(`Refusing absolute path in archive: ${entry.name}`);
    }

    const parts = normalised.split("/").filter(Boolean);
    if (parts.length <= strip) continue;
    const rel = parts.slice(strip).join("/");

    const target = safeJoin(destDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, inflateEntry(buf, entry));
    written++;
  }
  return written;
}

/**
 * The single top-level folder every entry shares, or null.
 *
 * GitHub's branch archives wrap everything in `<repo>-<branch>/`, while
 * a hand-built release zip may not wrap at all — so the strip depth has
 * to be measured rather than assumed. Guessing wrong unpacks the app one
 * directory too deep and the update silently does nothing useful.
 */
export function commonPrefix(buf) {
  const names = listZipEntries(buf)
    .map((e) => e.name.replace(/\\/g, "/"))
    .filter((n) => n && !n.startsWith("/"));
  if (names.length === 0) return null;

  const first = names[0].split("/")[0];
  if (!first) return null;
  // Every entry must be inside it, and at least one must be deeper —
  // otherwise this is a flat archive of files that merely share a name.
  const allInside = names.every((n) => n === first || n.startsWith(`${first}/`));
  const anyDeeper = names.some((n) => n.startsWith(`${first}/`));
  return allInside && anyDeeper ? first : null;
}
