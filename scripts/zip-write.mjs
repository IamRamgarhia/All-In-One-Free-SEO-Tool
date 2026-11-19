/**
 * A minimal, store-only zip writer — for TEST FIXTURES, not for release
 * artefacts.
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
 * Stored (method 0), no compression. Fixtures are a few kilobytes, and
 * deflate would add a dependency and a way to be subtly wrong for no
 * benefit. `unzip` reads stored entries fine.
 *
 *   node scripts/zip-write.mjs <sourceDir> <out.zip>
 *
 * Entry names always use forward slashes, which is what the format
 * requires and what every reader expects.
 */
import { createWriteStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

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
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(10, 4); // version needed (1.0 = store)
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method 0 = stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed
    local.writeUInt32LE(data.length, 22); // uncompressed
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length

    await write(local);
    await write(nameBuf);
    await write(data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(10, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
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

    offset += local.length + nameBuf.length + data.length;
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
