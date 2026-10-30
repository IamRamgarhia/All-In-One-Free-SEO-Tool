/**
 * Just enough zip reading to inspect an archive without spawning a
 * process.
 *
 * Written because `plugin-zip.test.ts` shelled out to `tar` and became
 * the only test in the suite that forks a child process — which made it
 * the only one that could fail from machine load rather than from a
 * real defect. It did, twice, both times just after heavy disk work,
 * and an intermittently red suite is worth less than no suite.
 *
 * Reads the central directory, which is the authoritative index: the
 * local headers can disagree with it, and unpackers trust the central
 * directory. Supports stored (method 0) and deflated (method 8), which
 * is everything a plugin zip contains.
 *
 * Not a general zip library: no zip64, no encryption, no multi-disk.
 * Those throw rather than returning something plausible.
 */
import { inflateRawSync } from "node:zlib";

export type ZipEntry = {
  /** Entry name exactly as stored — including a backslash, if some tool wrote one. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  method: number;
  localHeaderOffset: number;
};

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

/** Find the end-of-central-directory record, scanning back over any comment. */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Not a zip file: no end-of-central-directory record");
}

export function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  if (count === 0xffff || p === 0xffffffff) {
    throw new Error("zip64 archives are not supported here");
  }

  const out: ZipEntry[] = [];
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
export function readZipEntry(buf: Buffer, name: string): Buffer {
  const entry = listZipEntries(buf).find((e) => e.name === name);
  if (!entry) throw new Error(`No entry named ${name} in the archive`);

  const p = entry.localHeaderOffset;
  if (buf.readUInt32LE(p) !== LFH_SIG) {
    throw new Error(`Corrupt local header for ${name}`);
  }
  // The local header's own name/extra lengths, which can differ from
  // the central directory's extra field.
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`Unsupported compression method ${entry.method} for ${name}`);
}
