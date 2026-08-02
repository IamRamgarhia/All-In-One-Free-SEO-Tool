import { describe, expect, it } from "vitest";
import { accentColor, decodeLogo, displayName, isWhiteLabelled } from "./brand";
import type { Brand } from "./brand";

/**
 * This module exists because `loadBrand` was defined twice — in
 * report-generator.ts and quarterly-strategy.ts — and the copies had
 * already drifted on how an unsupported logo format was reported. One
 * returned mime "image/svg+xml" with a null buffer; the other returned
 * null for both. Nothing broke, because both callers happened to guard
 * on the buffer. That is luck, not design.
 *
 * White-label is not a cosmetic setting. An agency puts this output in
 * front of the client who pays them, and a footer reading "SEO Tool"
 * tells that client which product to go and buy directly.
 */

const empty: Brand = {
  name: null,
  color: null,
  tagline: null,
  website: null,
  email: null,
  phone: null,
  footerText: null,
  logoBuffer: null,
  logoMime: null,
  logoDataUrl: null,
};

describe("decodeLogo", () => {
  // A one-pixel PNG. Enough to prove the base64 path works.
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("decodes a PNG and reports its mime", () => {
    const { buffer, mime } = decodeLogo(png);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(mime).toBe("image/png");
  });

  it("returns buffer and mime together, or neither", () => {
    // THE regression. An SVG can't be drawn by pdfkit, so the buffer is
    // null — and the mime must be null too. The old report-generator
    // copy returned a mime for a logo it could not render, so any future
    // caller branching on `logoMime` alone would try to draw nothing.
    const svg = "data:image/svg+xml;base64,PHN2Zy8+";
    const { buffer, mime } = decodeLogo(svg);
    expect(buffer).toBeNull();
    expect(mime).toBeNull();
  });

  it("refuses WebP for the same reason", () => {
    const webp = "data:image/webp;base64,UklGRg==";
    expect(decodeLogo(webp)).toEqual({ buffer: null, mime: null });
  });

  it("handles null, junk and non-image data URLs without throwing", () => {
    for (const bad of [
      null,
      "",
      "not-a-data-url",
      "data:text/plain;base64,aGk=",
      "data:image/png;base64,",
    ]) {
      expect(decodeLogo(bad), String(bad)).toEqual({
        buffer: null,
        mime: null,
      });
    }
  });
});

describe("isWhiteLabelled", () => {
  it("needs a name — a colour alone isn't a brand", () => {
    expect(isWhiteLabelled({ ...empty, color: "#ff0000" })).toBe(false);
  });

  it("ignores a name that's only whitespace", () => {
    // Someone clearing the field leaves " " surprisingly often, and a
    // portal header rendering a blank agency name looks broken.
    expect(isWhiteLabelled({ ...empty, name: "   " })).toBe(false);
  });

  it("is true once a real name is set", () => {
    expect(isWhiteLabelled({ ...empty, name: "Northbound SEO" })).toBe(true);
  });
});

describe("displayName", () => {
  it("falls back to the product name when unbranded", () => {
    expect(displayName(empty)).toBe("SEO Tool");
  });

  it("uses the agency name when branded, trimmed", () => {
    expect(displayName({ ...empty, name: "  Northbound SEO " })).toBe(
      "Northbound SEO",
    );
  });
});

describe("accentColor", () => {
  it("accepts a six-digit hex", () => {
    expect(accentColor({ ...empty, color: "#1A2B3C" })).toBe("#1A2B3C");
  });

  it("rejects anything else rather than emitting broken CSS", () => {
    // These end up interpolated straight into a style attribute and a
    // PDF fill. A malformed value silently breaks the whole gradient.
    for (const bad of ["red", "#fff", "#12345", "rgb(1,2,3)", "", "#gggggg"]) {
      expect(accentColor({ ...empty, color: bad }), bad).toBe("#7c3aed");
    }
  });

  it("honours a caller-supplied fallback", () => {
    expect(accentColor(empty, "#000000")).toBe("#000000");
  });
});
