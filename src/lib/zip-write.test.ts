/**
 * The payload zip must actually be compressed.
 *
 * WHY THIS EXISTS: `scripts/zip-write.mjs` opened with
 *
 *   "A minimal, store-only zip writer — for TEST FIXTURES, not for
 *    release artefacts."
 *
 * and `scripts/build-prebuilt-zip.mjs` imported it to build the release
 * artefact. A comment disclaiming a use does not prevent the use.
 *
 * So every prebuilt payload shipped uncompressed. Measured on the
 * v0.10.2 draft: 407 MB per platform, while GitHub's own re-zipping of
 * the same file for the Actions artefact came to 99 MB. Repacked with
 * deflate, the local payload went from a 407 MB class download to
 * 118 MB — of a file the installer introduces as "the whole app — a
 * few hundred MB", over connections that are not all fast.
 *
 * Nothing failed. Nothing was wrong. It was just four times bigger than
 * it needed to be, for everyone, silently — which is the shape of bug
 * this project writes tests for.
 */

import { describe, expect, it, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { writeZip } from "../../scripts/zip-write.mjs";
import { extractZip, listZipEntries } from "../../scripts/zip-read.mjs";

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "zipw-"));
  dirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A source tree shaped like a payload: mostly repetitive JS. */
async function pack(files: Record<string, string | Buffer>): Promise<Buffer> {
  const src = join(tmp(), "src");
  mkdirSync(src, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const full = join(src, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  const out = join(tmp(), "out.zip");
  await writeZip(src, out);
  expect(statSync(out).size).toBeGreaterThan(0);
  return readFileSync(out);
}

// What node_modules and .next actually are: the same tokens over and
// over. 176 KB of this deflates to well under a kilobyte.
const REPETITIVE = "export function hello() { return 'world'; }\n".repeat(4000);

describe("the payload writer compresses", () => {
  it("deflates a compressible file", async () => {
    const buf = await pack({ "server.js": REPETITIVE });
    const [entry] = listZipEntries(buf);
    // Method 8 is deflate, 0 is stored. This single assertion is the
    // one that was false for every release before v0.10.2.
    expect(entry.method, "stored, not deflated — the payload is 4x too big").toBe(8);
    expect(entry.uncompressedSize).toBe(Buffer.byteLength(REPETITIVE));
    expect(entry.compressedSize).toBeLessThan(entry.uncompressedSize / 10);
  });

  it("the whole archive is smaller than its contents", async () => {
    const buf = await pack({
      "server.js": REPETITIVE,
      "nested/page.js": REPETITIVE,
    });
    expect(buf.length).toBeLessThan(Buffer.byteLength(REPETITIVE) / 2);
  });

  it("falls back to stored when deflate would make an entry bigger", async () => {
    // Random bytes stand in for a .png, a .woff2 or a bundled binary.
    // Deflate adds a few bytes to incompressible input, and a zip
    // entry's method is per entry precisely so it does not have to.
    const noise = randomBytes(64_000);
    const buf = await pack({ "blob.bin": noise });
    const [entry] = listZipEntries(buf);
    expect(entry.method).toBe(0);
    expect(entry.compressedSize).toBe(noise.length);
  });

  it("mixes both methods in one archive", async () => {
    const buf = await pack({
      "a.js": REPETITIVE,
      "b.bin": randomBytes(64_000),
    });
    const methods = listZipEntries(buf)
      .map((e) => e.method)
      .sort();
    expect(methods).toEqual([0, 8]);
  });
});

describe("the archive stays readable", () => {
  it("round-trips deflated content through our own reader", async () => {
    // zip-read.mjs is what the zip-install updater unpacks a release
    // with. If it could not inflate, turning on compression would have
    // broken every self-update — it handles method 8, and this proves
    // it against bytes this writer produced rather than against a
    // fixture written by hand.
    const noise = randomBytes(20_000);
    const buf = await pack({
      "server.js": REPETITIVE,
      "nested/deep/blob.bin": noise,
      "empty.txt": "",
    });
    const dest = tmp();
    extractZip(buf, dest);
    expect(readFileSync(join(dest, "server.js"), "utf8")).toBe(REPETITIVE);
    expect(
      Buffer.compare(readFileSync(join(dest, "nested/deep/blob.bin")), noise),
    ).toBe(0);
    expect(readFileSync(join(dest, "empty.txt"), "utf8")).toBe("");
  });

  it("declares entry names as UTF-8", async () => {
    // General-purpose flag bit 11. Names were always written as UTF-8
    // bytes and the flag was always 0, which tells a reader the
    // opposite — that the name is CP437. Our reader decodes UTF-8
    // unconditionally so it never noticed; `unzip` and Explorer honour
    // the flag, and `café.txt` came out as `caf+®.txt`.
    const buf = await pack({ "café.txt": "naïve\n" });
    // Local header flags are at offset 6.
    expect(buf.readUInt16LE(6) & 0x0800).toBe(0x0800);
    const [entry] = listZipEntries(buf);
    expect(entry.name).toBe("café.txt");
  });

  it("writes the compressed size in both headers, and they agree", async () => {
    // The local header and the central directory each carry the sizes
    // and the method. A reader that trusts the central directory and
    // finds a deflate stream it was told is stored produces GARBAGE
    // rather than an error — so a mismatch here is the worst kind of
    // wrong, and it is the specific thing that changed when compression
    // was turned on.
    const buf = await pack({ "server.js": REPETITIVE });
    const [entry] = listZipEntries(buf); // read from the central directory
    const localMethod = buf.readUInt16LE(8);
    const localCompressed = buf.readUInt32LE(18);
    const localUncompressed = buf.readUInt32LE(22);
    expect(localMethod).toBe(entry.method);
    expect(localCompressed).toBe(entry.compressedSize);
    expect(localUncompressed).toBe(entry.uncompressedSize);
  });
});
