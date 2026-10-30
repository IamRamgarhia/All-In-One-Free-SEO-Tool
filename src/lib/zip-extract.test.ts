import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { crc32 } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commonPrefix, extractZip, safeJoin } from "../../scripts/zip-read.mjs";

/**
 * Unpacking an archive downloaded over the network.
 *
 * `bin/seo-update-zip.mjs` fetches a release and unpacks it over a
 * working install, so this is the one place in the codebase where an
 * attacker-controlled path is a live concern rather than a theoretical
 * one. "Zip slip" — an entry named `../../../.ssh/authorized_keys` — is
 * the classic, and a naive unpacker writes exactly there.
 *
 * The rest is about not silently doing nothing: the strip depth has to
 * be measured, because guessing wrong unpacks one directory too deep
 * and the update appears to succeed while changing nothing.
 *
 * The fixtures are built in-process rather than by shelling out to
 * `tar`. plugin-zip.test.ts did that and became the only test in the
 * suite that forks a child process, which made it the only one that
 * could fail from machine load rather than a defect — it did, twice.
 * Writing the bytes here also lets a non-conformant name be built
 * deliberately, which no real zip tool will emit.
 */

const temps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "zip-extract-test-"));
  temps.push(d);
  return d;
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

/**
 * A minimal zip writer: stored (uncompressed) entries only.
 *
 * Names are written as given, byte for byte, including a backslash or a
 * `..` — which is the entire point of having one here.
 */
function makeZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, body] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(body, "utf8");
    const sum = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method 0 = stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(local, 30);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(0, 10); // method
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuf.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, cd, eocd]);
}

describe("the test's own zip writer", () => {
  it("produces something the reader agrees with", () => {
    // These fixtures are only as good as the writer. If this breaks,
    // every assertion below is testing nothing.
    const dest = tmp();
    extractZip(makeZip({ "x.txt": "hello" }), dest);
    expect(readFileSync(join(dest, "x.txt"), "utf8")).toBe("hello");
  });
});

describe("safeJoin", () => {
  it("allows an ordinary path", () => {
    const base = tmp();
    expect(safeJoin(base, "src/lib/audit.ts")).toBe(join(base, "src/lib/audit.ts"));
  });

  it("refuses to climb out of the destination", () => {
    const base = tmp();
    for (const evil of [
      "../outside.txt",
      "../../../../etc/passwd",
      "src/../../escape.txt",
      "a/b/../../../c.txt",
    ]) {
      expect(() => safeJoin(base, evil), evil).toThrow(/outside the destination/);
    }
  });

  it("refuses an absolute path", () => {
    const base = tmp();
    expect(() => safeJoin(base, "/etc/passwd")).toThrow(/absolute/);
    expect(() => safeJoin(base, "C:/Windows/system32/x.dll")).toThrow(/absolute/);
  });

  it("treats a backslash as a separator on every platform", () => {
    // Backslashes are legal in a zip name, and PowerShell's
    // Compress-Archive writes them as separators. Handling them only on
    // Windows would let `a\..\..\b` walk straight out on Linux.
    const base = tmp();
    expect(() => safeJoin(base, "a\\..\\..\\escape.txt")).toThrow(
      /outside the destination/,
    );
  });

  it("keeps a legitimate deep path", () => {
    const base = tmp();
    expect(safeJoin(base, "deep/nested/ok.txt")).toBe(join(base, "deep/nested/ok.txt"));
  });
});

describe("extractZip", () => {
  it("writes the files", () => {
    const dest = tmp();
    const n = extractZip(makeZip({ "a.txt": "one", "dir/b.txt": "two" }), dest);
    expect(n).toBe(2);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("one");
    expect(readFileSync(join(dest, "dir/b.txt"), "utf8")).toBe("two");
  });

  it("strips the leading folder GitHub wraps archives in", () => {
    const dest = tmp();
    extractZip(makeZip({ "repo-main/package.json": "{}", "repo-main/src/x.ts": "x" }), dest, {
      strip: 1,
    });
    expect(existsSync(join(dest, "package.json"))).toBe(true);
    expect(existsSync(join(dest, "src/x.ts"))).toBe(true);
    // The wrapper itself must not survive, or every path is one level
    // too deep and the update copies nothing useful.
    expect(existsSync(join(dest, "repo-main"))).toBe(false);
  });

  it("turns backslash entry names into real folders", () => {
    /**
     * Not hypothetical: the PUBLISHED v0.9.0 release zip contains 1,367
     * entries whose names use backslashes, because it was built with
     * PowerShell's Compress-Archive. Unpacked naively that is a heap of
     * oddly-named files and no directories at all. The updater has to
     * cope, because those releases are already out there and people
     * will update FROM them.
     */
    const dest = tmp();
    extractZip(makeZip({ "_system\\src\\lib\\audit.ts": "code" }), dest);
    expect(readFileSync(join(dest, "_system/src/lib/audit.ts"), "utf8")).toBe("code");
  });

  it("refuses an archive that tries to escape, writing nothing outside", () => {
    // `dest` is a folder INSIDE a temp dir of this test's own, so the
    // "did anything land outside?" check looks at a directory nothing
    // else writes to. Checking the shared system temp dir instead makes
    // this fail forever once any run — including a deliberate mutation
    // run — has dropped a file there. It did exactly that.
    const parent = tmp();
    const dest = join(parent, "inner");
    mkdirSync(dest);

    expect(() => extractZip(makeZip({ "../esc.txt": "pwned" }), dest)).toThrow(
      /outside the destination/,
    );
    expect(existsSync(join(parent, "esc.txt"))).toBe(false);
    expect(readdirSync(parent)).toEqual(["inner"]);
  });

  it("refuses an absolute entry, which would ignore the destination entirely", () => {
    const dest = tmp();
    expect(() => extractZip(makeZip({ "/tmp/pwned.txt": "x" }), dest)).toThrow(
      /absolute/,
    );
  });

  it("skips directory entries rather than writing them as files", () => {
    const dest = tmp();
    extractZip(makeZip({ "dir/": "", "dir/b.txt": "two" }), dest);
    // `dir` must be a directory with b.txt inside, not a file.
    expect(readdirSync(join(dest, "dir"))).toContain("b.txt");
  });

  it("skips an entry with fewer segments than the strip depth", () => {
    // A stray file at the archive root alongside a wrapper folder would
    // otherwise be written with an empty name.
    const dest = tmp();
    const n = extractZip(makeZip({ "loose.txt": "x", "repo/a.txt": "y" }), dest, {
      strip: 1,
    });
    expect(n).toBe(1);
    expect(readFileSync(join(dest, "a.txt"), "utf8")).toBe("y");
  });
});

describe("commonPrefix", () => {
  it("finds the single wrapper folder", () => {
    expect(commonPrefix(makeZip({ "repo-main/a.txt": "1", "repo-main/b/c.txt": "2" }))).toBe(
      "repo-main",
    );
  });

  it("returns null when entries are at the root", () => {
    // Stripping here would delete the first path segment of every file.
    expect(commonPrefix(makeZip({ "a.txt": "1", "b.txt": "2" }))).toBeNull();
  });

  it("returns null when there are several top-level entries", () => {
    // The release zip's real shape: launchers beside `_system/`.
    expect(
      commonPrefix(makeZip({ "SEO Tool.hta": "x", "_system/package.json": "{}" })),
    ).toBeNull();
  });
});
