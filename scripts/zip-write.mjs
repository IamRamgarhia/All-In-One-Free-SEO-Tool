/**
 * A minimal zip writer, deflate with a per-entry fallback to stored.
 *
 * It said "store-only — for TEST FIXTURES, not for release artefacts"
 * and `build-prebuilt-zip.mjs` was using it for the release artefact,
 * which is how every prebuilt payload came to be uncompressed. The
 * header disclaiming a use does not prevent the use; see the note on
 * `deflateRawAsync` below for what it cost.
 *
 * WHY THIS EXISTS: scripts/install-prebuilt-check.sh needs to build
 * archives to feed the installer, and on this machine there is no `zip`.
 * The two obvious substitutes both fail:
 *
 *   - PowerShell's Compress-Archive writes BACKSLASH path separators,
 *     and `unzip` refuses the result with "appears to use backslashes as
 *     path separators". The first run of that test failed on exactly
 *     this, and the failure looked like a product bug for a minute.
 *   - GNU tar will not write zip at all. `tar -a -c -f out.zip .`
 *     silently produced a tar named .zip, which unzip then reported as
 *     "not a zipfile" — the same observation already recorded about
 *     tar's inability to READ zip.
 *
 * Deflate (method 8) per entry, falling back to stored (method 0) when
 * deflating would make that entry larger — which it does, by a few
 * bytes, on anything already compressed. Readers handle a mix of both
 * within one archive, which is what the per-entry method field is for.
 *
 *   node scripts/zip-write.mjs <sourceDir> <out.zip>
 *
 * Entry names always use forward slashes, which is what the format
 * requires and what every reader expects.
 */
import { createWriteStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { deflateRaw } from "node:zlib";
import { promisify } from "node:util";

/**
 * `zlib` is built into Node, so deflate costs no dependency.
 *
 * The original version of this file said deflate "would add a
 * dependency and a way to be subtly wrong for no benefit" and wrote
 * stored entries only. The first half was simply wrong — `node:zlib`
 * ships with the runtime — and the "no benefit" held only while this
 * was a fixture writer. It is not: build-prebuilt-zip.mjs uses it for
 * the payload every macOS and Linux user downloads.
 *
 * Measured on the v0.10.2 release: 407 MB stored. GitHub's own
 * re-zipping of the same file for the Actions artefact was 99 MB, which
 * is the 4:1 that was being left on the table — of a download the
 * installer calls "the whole app — a few hundred MB".
 */
const deflateRawAsync = promisify(deflateRaw);

/**
 * General-purpose flag bit 11: "the name in this header is UTF-8".
 *
 * Entry names here have always been written as UTF-8 bytes and the flag
 * was always 0, which tells a reader the opposite — that the name is
 * CP437. Our own zip-read.mjs decodes as UTF-8 unconditionally, so it
 * never noticed; `unzip` and Windows Explorer honour the flag, so they
 * did.
 *
 * Caught by extracting an archive containing `café.txt` with real
 * `unzip`: the file came out under a different name and reading it back
 * failed with ENOENT. `node_modules` is thousands of files from
 * thousands of authors, so a non-ASCII name in a payload is a matter of
 * time rather than a hypothetical.
 */
const UTF8_NAME_FLAG = 0x0800;

/** CRC-32, table built once. Required in both headers. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** DOS date/time. The value does not matter; a valid one does. */
function dosDateTime(d = new Date()) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

async function walk(dir, base = dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

export async function writeZip(sourceDir, outPath) {
  const names = (await walk(sourceDir)).sort();
  const out = createWriteStream(outPath);
  const write = (buf) =>
    new Promise((res, rej) => out.write(buf, (e) => (e ? rej(e) : res())));

  const central = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const name of names) {
    const data = await readFile(join(sourceDir, name));
    const nameBuf = Buffer.from(name, "utf8");
    // CRC is always of the ORIGINAL bytes, never of the deflated ones.
    const crc = crc32(data);

    // Deflate, falling back to stored when it does not help.
    //
    // A zip entry may be stored (method 0) or deflated (method 8), per
    // entry, and readers handle both. Picking the smaller means an
    // already-compressed file — a .png, a .woff2, a .zip inside the
    // payload — is not made bigger by deflating it, which deflate does
    // by a few bytes on incompressible input.
    const deflated = await deflateRawAsync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    // "version needed": 2.0 for deflate, 1.0 for stored.
    const versionNeeded = useDeflate ? 20 : 10;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(versionNeeded, 4);
    local.writeUInt16LE(UTF8_NAME_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    await write(local);
    await write(nameBuf);
    await write(body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(versionNeeded, 6);
    cd.writeUInt16LE(UTF8_NAME_FLAG, 8);
    // The central directory's method MUST match the local header's.
    // A reader that trusts the central directory and finds a deflate
    // stream it was told is stored produces garbage rather than an
    // error, which is the subtle-wrongness this file's header warns
    // about — so these two are written from the same variable.
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20); // compressed size
    cd.writeUInt32LE(data.length, 24); // uncompressed size
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attrs
    // >>> 0 because JS `<<` yields a SIGNED 32-bit int: 0o100644 << 16
    // is -2119958528, and writeUInt32LE rejects it outright. Caught by
    // running it.
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));

    // body.length, not data.length — the offset of the next local
    // header is where THIS entry's bytes end on disk. Using the
    // uncompressed size here would point every central-directory entry
    // after the first at the wrong place, and the archive would fail to
    // open at all rather than quietly.
    offset += local.length + nameBuf.length + body.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    await write(c);
    cdSize += c.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with cd
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  end.writeUInt16LE(0, 20); // comment length
  await write(end);

  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  return { entries: names.length, bytes: offset + cdSize + end.length };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith("zip-write.mjs")) {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("usage: node scripts/zip-write.mjs <sourceDir> <out.zip>");
    process.exit(2);
  }
  const srcDir = src;
  const st = await stat(srcDir).catch(() => null);
  if (!st?.isDirectory()) {
    console.error(`not a directory: ${srcDir}`);
    process.exit(2);
  }
  const r = await writeZip(srcDir, dest);
  console.log(`${dest}: ${r.entries} entries, ${r.bytes} bytes`);
}
