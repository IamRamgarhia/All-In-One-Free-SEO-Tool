/**
 * Render the Inno Setup wizard's two images from the app icon.
 *
 * WHY GENERATED RATHER THAN COMMITTED: a .bmp checked into the repo
 * drifts from the icon the moment the icon changes, and nobody notices
 * because nobody opens a .bmp. These are built from
 * public/icon-512.png, so the installer wears the same mark as the app.
 *
 * WHY A HAND-WRITTEN PNG DECODER: `sharp` is not a direct dependency —
 * it arrives transitively through Next — and public/icon.ico turned out
 * to hold a single PNG-compressed frame, so there is no decoder-free
 * path through the .ico either. Adding a native image library to the
 * build so the installer can have a side panel is the wrong trade. This
 * project already hand-wrote a zip reader and writer for the same
 * reason; `node:zlib` does the only hard part.
 *
 * The decoder handles EXACTLY the shape this file is (8-bit RGBA,
 * non-interlaced) and REFUSES anything else by name. A decoder that
 * guesses at a format it does not support produces a panel of garbage,
 * and nobody would look at a .bmp to notice.
 *
 * Inno wants BMP — it does not read PNG — at:
 *
 *   WizardImageFile       164 x 314   down the left of the welcome and
 *                                     finished pages
 *   WizardSmallImageFile   55 x  55   the corner of every other page
 *
 *   node scripts/build-installer-art.mjs
 */
import { inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(ROOT, "public", "icon-512.png");
const OUT = join(ROOT, "installer", "art");

/** The app's own background, so the panel does not glow white. */
const BG = [10, 10, 12];

/**
 * Decode a non-interlaced 8-bit RGBA PNG to flat pixels.
 *
 * @returns {{ width: number, height: number, data: Buffer }} RGBA, 4 bytes per pixel
 */
function decodePng(buf) {
  const sig = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== sig) {
    throw new Error("not a PNG");
  }

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];

  // Refuse rather than guess. Every one of these produces a different
  // byte layout, and reading one as another yields a plausible-looking
  // mess.
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth}, expected 8`);
  if (colorType !== 6) throw new Error(`colour type ${colorType}, expected 6 (RGBA)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");

  // Concatenate every IDAT, then inflate once: the compressed stream
  // runs ACROSS chunk boundaries, so inflating them individually fails.
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);

  // Un-filter. Each scanline is prefixed with its filter type, and the
  // predictors reference the pixel to the left (a), the one above (b)
  // and above-left (c) — of the ALREADY UNFILTERED output, which is why
  // this has to run top to bottom.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      switch (filter) {
        case 0: cur[x] = v; break;
        case 1: cur[x] = (v + a) & 0xff; break;
        case 2: cur[x] = (v + b) & 0xff; break;
        case 3: cur[x] = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          cur[x] = (v + pred) & 0xff;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter} on row ${y}`);
      }
    }
  }

  return { width, height, data: out };
}

/** Box-filter downscale of RGBA pixels. Averages alpha too. */
function resize(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const xRatio = img.width / w;
  const yRatio = img.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4;
          r += img.data[i]; g += img.data[i + 1];
          b += img.data[i + 2]; a += img.data[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n;
      out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

/** 24-bit BMP: bottom-up rows, BGR, each row padded to 4 bytes. */
function toBmp(pixels, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const body = Buffer.alloc(rowSize * height, 0);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 3; // BMP rows run bottom to top
    const dst = y * rowSize;
    for (let x = 0; x < width; x++) {
      const s = src + x * 3;
      const d = dst + x * 3;
      body[d] = pixels[s + 2];     // B
      body[d + 1] = pixels[s + 1]; // G
      body[d + 2] = pixels[s];     // R
    }
  }

  const header = Buffer.alloc(54);
  header.write("BM", 0, "ascii");
  header.writeUInt32LE(54 + body.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(body.length, 34);
  header.writeInt32LE(2835, 38); // 72 DPI
  header.writeInt32LE(2835, 42);
  return Buffer.concat([header, body]);
}

/** The icon centred on a flat panel, flattened onto the background. */
function panel(icon, width, height, markSize) {
  const mark = resize(icon, markSize, markSize);
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = BG[0]; rgb[i * 3 + 1] = BG[1]; rgb[i * 3 + 2] = BG[2];
  }

  const ox = Math.floor((width - markSize) / 2);
  const oy = Math.floor((height - markSize) / 2);
  for (let y = 0; y < markSize; y++) {
    for (let x = 0; x < markSize; x++) {
      const px = ox + x;
      const py = oy + y;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const s = (y * markSize + x) * 4;
      const d = (py * width + px) * 3;
      // Alpha-composite onto the panel. BMP has no alpha channel, so
      // this has to be flattened here or the mark arrives with a black
      // box around it.
      const a = mark.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) {
        rgb[d + c] = Math.round(mark.data[s + c] * a + BG[c] * (1 - a));
      }
    }
  }
  return toBmp(rgb, width, height);
}

function main() {
  const icon = decodePng(readFileSync(SRC));
  mkdirSync(OUT, { recursive: true });

  const large = panel(icon, 164, 314, 110);
  const small = panel(icon, 55, 55, 44);
  writeFileSync(join(OUT, "wizard-large.bmp"), large);
  writeFileSync(join(OUT, "wizard-small.bmp"), small);

  process.stdout.write(
    `  decoded ${icon.width}x${icon.height} RGBA\n` +
      `  wrote installer/art/wizard-large.bmp  164x314  ${large.length} bytes\n` +
      `  wrote installer/art/wizard-small.bmp   55x55   ${small.length} bytes\n`,
  );
}

main();
