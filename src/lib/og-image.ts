/**
 * OG image generator — Satori-powered. Renders a JSX tree to SVG via
 * Satori (pure JS, no browser), then converts SVG → PNG with @resvg/resvg-js.
 *
 * Replaces the previous headless-chromium implementation. Trade-offs:
 *
 *   Before (headless Chrome screenshot)
 *     Per call:  ~3-5 sec, ~300 MB RAM spike
 *     Bundle:    ~0 (browser already pooled for SERP scans, etc.)
 *     Quality:   Full HTML/CSS support
 *
 *   After (Satori + resvg)
 *     Per call:  ~80-150 ms, < 20 MB RAM
 *     Bundle:    ~3 MB (satori) + ~3 MB (resvg-js)
 *     Quality:   ~95% of CSS — flexbox, gradients, fonts, shadows.
 *                No: filters, complex backgrounds, animations.
 *
 * Same exported function signature so callers don't change.
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import React from "react";

export type OgTemplate = "minimal" | "gradient" | "card" | "magazine";

export type OgOptions = {
  title: string;
  subtitle?: string;
  brand?: string;
  brandColor?: string;
  template?: OgTemplate;
  imageUrl?: string;
};

// Font is loaded once and reused. Satori requires a TTF; we fall back
// to a CDN-hosted Inter font fetched on first call when no local font
// is present. The font Buffer is small (~250 KB regular weight).
let cachedFontRegular: ArrayBuffer | null = null;
let cachedFontBold: ArrayBuffer | null = null;

async function loadLocalFont(file: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(
      join(process.cwd(), "src", "lib", "fonts", file),
    );
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (cachedFontRegular && cachedFontBold) {
    return { regular: cachedFontRegular, bold: cachedFontBold };
  }
  // Prefer the Inter TTFs in src/lib/fonts/ if the user dropped them
  // in for the PDF reports — reuses the same asset.
  const r = await loadLocalFont("Inter-Regular.ttf");
  const b = await loadLocalFont("Inter-Bold.ttf");
  if (r && b) {
    cachedFontRegular = r;
    cachedFontBold = b;
    return { regular: r, bold: b };
  }
  // Fallback: pull from Google Fonts CDN at first run. Cached for the
  // process lifetime.
  const fetchTtf = async (cssUrl: string): Promise<ArrayBuffer> => {
    const cssRes = await fetch(cssUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\((https:[^)]+\.ttf)\)/);
    if (!match) throw new Error("Couldn't find TTF in CSS response");
    const fontRes = await fetch(match[1]);
    return await fontRes.arrayBuffer();
  };
  cachedFontRegular = await fetchTtf(
    "https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap",
  );
  cachedFontBold = await fetchTtf(
    "https://fonts.googleapis.com/css2?family=Inter:wght@700&display=swap",
  );
  return { regular: cachedFontRegular, bold: cachedFontBold };
}

export async function generateOgImage(opts: OgOptions): Promise<{
  ok: boolean;
  dataUrl?: string;
  error?: string;
}> {
  try {
    const { regular, bold } = await loadFonts();
    const svg = await satori(buildTree(opts), {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
    });
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
    const png = resvg.render().asPng();
    const dataUrl = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
    return { ok: true, dataUrl };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ──────────────────────────────────────────────────────────────────
// Template builders. Each returns a Satori-compatible JSX tree.
// Satori supports a subset of CSS: flexbox, gradients, transforms,
// text styling. No filter, no clip-path, no complex backgrounds.
// ──────────────────────────────────────────────────────────────────

function buildTree(opts: OgOptions): React.ReactElement {
  const tmpl = opts.template ?? "gradient";
  const brand = opts.brand;
  const color = opts.brandColor ?? "#7c3aed";
  const { title, subtitle, imageUrl } = opts;

  if (tmpl === "minimal") {
    return Minimal({ title, subtitle, brand, color });
  }
  if (tmpl === "card") {
    return Card({ title, subtitle, brand, color });
  }
  if (tmpl === "magazine") {
    return Magazine({ title, subtitle, brand, color, imageUrl });
  }
  return Gradient({ title, subtitle, brand, color });
}

type TemplateProps = {
  title: string;
  subtitle?: string;
  brand?: string;
  color: string;
  imageUrl?: string;
};

function Minimal({ title, subtitle, brand, color }: TemplateProps) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#0c0d12",
        color: "#fff",
        fontFamily: "Inter",
      },
    },
    brand
      ? React.createElement(
          "div",
          {
            style: {
              fontSize: 24,
              color,
              fontWeight: 600,
              marginBottom: 24,
              letterSpacing: "0.05em",
            },
          },
          brand,
        )
      : null,
    React.createElement(
      "div",
      {
        style: {
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.1,
          maxWidth: 1000,
        },
      },
      title,
    ),
    subtitle
      ? React.createElement(
          "div",
          {
            style: {
              marginTop: 24,
              fontSize: 28,
              color: "rgba(255,255,255,0.7)",
              lineHeight: 1.4,
              maxWidth: 900,
            },
          },
          subtitle,
        )
      : null,
  );
}

function Gradient({ title, subtitle, brand, color }: TemplateProps) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        padding: "80px",
        background: `linear-gradient(135deg, #0c0d12 0%, ${color}22 50%, #06b6d422 100%)`,
        color: "#fff",
        fontFamily: "Inter",
      },
    },
    React.createElement(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      brand
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: 24,
                color,
                fontWeight: 700,
                marginBottom: 24,
                letterSpacing: "0.05em",
              },
            },
            brand,
          )
        : null,
      React.createElement(
        "div",
        {
          style: {
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.05,
            maxWidth: 950,
            color: "#fff",
          },
        },
        title,
      ),
      subtitle
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: 32,
                fontSize: 30,
                color: "rgba(255,255,255,0.65)",
                lineHeight: 1.4,
                maxWidth: 900,
              },
            },
            subtitle,
          )
        : null,
    ),
  );
}

function Card({ title, subtitle, brand, color }: TemplateProps) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px",
        background: `linear-gradient(135deg, ${color} 0%, #0c0d12 100%)`,
        fontFamily: "Inter",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: 1080,
          minHeight: 510,
          background: "rgba(15,17,28,0.85)",
          borderRadius: 24,
          padding: 60,
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
        },
      },
      brand
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: 22,
                color,
                fontWeight: 600,
                marginBottom: 20,
              },
            },
            brand,
          )
        : null,
      React.createElement(
        "div",
        {
          style: { fontSize: 60, fontWeight: 700, lineHeight: 1.1, maxWidth: 950 },
        },
        title,
      ),
      subtitle
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: 24,
                fontSize: 26,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.4,
              },
            },
            subtitle,
          )
        : null,
    ),
  );
}

function Magazine({ title, subtitle, brand, color, imageUrl }: TemplateProps) {
  return React.createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#0c0d12",
        color: "#fff",
        fontFamily: "Inter",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          width: 700,
          padding: "80px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderLeft: `8px solid ${color}`,
        },
      },
      brand
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: 16,
                color,
                fontWeight: 700,
                marginBottom: 24,
                letterSpacing: "0.15em",
              },
            },
            brand.toUpperCase(),
          )
        : null,
      React.createElement(
        "div",
        { style: { fontSize: 56, fontWeight: 700, lineHeight: 1.1 } },
        title,
      ),
      subtitle
        ? React.createElement(
            "div",
            {
              style: {
                marginTop: 24,
                fontSize: 24,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.4,
              },
            },
            subtitle,
          )
        : null,
    ),
    imageUrl
      ? React.createElement("img", {
          src: imageUrl,
          style: {
            width: 500,
            height: 630,
            objectFit: "cover",
          },
        })
      : React.createElement("div", {
          style: { width: 500, height: 630, background: "#1a1d2a" },
        }),
  );
}
