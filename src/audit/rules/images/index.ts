import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

function images($: import("cheerio").CheerioAPI) {
  return $("img");
}

export const altPresentRule = defineRule({
  id: "images-alt-present",
  category: "images",
  severity: "high",
  weight: 15,
  title: "Images have alt attributes",
  description: "Every <img> should have an alt attribute (empty OK for decorative)",
  recommendation: "Add alt=\"…\" describing the image, or alt=\"\" if decorative.",
  check: async ({ $ }) => {
    const missing: string[] = [];
    images($).each((_, el) => {
      if ($(el).attr("alt") == null) {
        missing.push($(el).attr("src") ?? "(no src)");
      }
    });
    if (missing.length === 0) return pass("All images have an alt attribute");
    return fail(`${missing.length} image(s) missing alt`, {
      samples: missing.slice(0, 8),
    });
  },
});

export const altQualityRule = defineRule({
  id: "images-alt-quality",
  category: "images",
  severity: "medium",
  weight: 6,
  title: "Alt text quality",
  description: "Avoid filename-like or generic alt text",
  recommendation: "Write human-readable alt text; avoid “image1.jpg” / “photo”.",
  check: async ({ $ }) => {
    const bad: Array<{ src: string; alt: string }> = [];
    images($).each((_, el) => {
      const alt = ($(el).attr("alt") ?? "").trim();
      if (!alt) return;
      if (
        /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(alt) ||
        /^(image|photo|picture|img)\d*$/i.test(alt)
      ) {
        bad.push({ src: $(el).attr("src") ?? "", alt });
      }
    });
    if (bad.length === 0) return pass("Alt text looks meaningful");
    return warn(`${bad.length} low-quality alt text(s)`, { samples: bad.slice(0, 6) });
  },
});

export const altLengthRule = defineRule({
  id: "images-alt-length",
  category: "images",
  severity: "low",
  weight: 3,
  title: "Alt text length",
  description: "Very long alt text is usually a smell",
  recommendation: "Keep alt concise (typically under ~125 characters).",
  check: async ({ $ }) => {
    const long: Array<{ src: string; length: number }> = [];
    images($).each((_, el) => {
      const alt = $(el).attr("alt") ?? "";
      if (alt.length > 125) {
        long.push({ src: $(el).attr("src") ?? "", length: alt.length });
      }
    });
    if (long.length === 0) return pass("Alt lengths look reasonable");
    return warn(`${long.length} overly long alt text(s)`, { samples: long.slice(0, 5) });
  },
});

export const dimensionsRule = defineRule({
  id: "images-dimensions",
  category: "images",
  severity: "high",
  weight: 12,
  title: "Width/height on images",
  description: "Missing dimensions contribute to CLS",
  recommendation: "Set width and height attributes (or CSS aspect-ratio).",
  check: async ({ $ }) => {
    const missing: string[] = [];
    images($).each((_, el) => {
      const w = $(el).attr("width");
      const h = $(el).attr("height");
      if (!w || !h) missing.push($(el).attr("src") ?? "(no src)");
    });
    if (missing.length === 0) return pass("Images declare width and height");
    return warn(`${missing.length} image(s) missing width/height`, {
      samples: missing.slice(0, 8),
    });
  },
});

export const lazyLoadingRule = defineRule({
  id: "images-lazy-loading",
  category: "images",
  severity: "medium",
  weight: 6,
  title: "Lazy-load below-the-fold images",
  description: "Non-leading images should use loading=lazy",
  recommendation: "Add loading=\"lazy\" to below-the-fold images.",
  check: async ({ $ }) => {
    const imgs = images($).toArray();
    if (imgs.length <= 1) return pass("Too few images to judge lazy-loading");
    const rest = imgs.slice(1);
    const lazy = rest.filter(
      (el) => ($(el).attr("loading") ?? "").toLowerCase() === "lazy",
    );
    const ratio = lazy.length / rest.length;
    if (ratio >= 0.5) return pass(`${lazy.length}/${rest.length} below-fold images are lazy`);
    return warn(`Only ${lazy.length}/${rest.length} below-fold images use loading=lazy`);
  },
});

export const modernFormatRule = defineRule({
  id: "images-modern-format",
  category: "images",
  severity: "medium",
  weight: 7,
  title: "Modern image formats",
  description: "Prefer WebP/AVIF over heavy legacy formats where possible",
  recommendation: "Serve WebP/AVIF with JPEG/PNG fallbacks via <picture>.",
  check: async ({ $ }) => {
    let legacy = 0;
    let modern = 0;
    images($).each((_, el) => {
      const src = ($(el).attr("src") ?? "").toLowerCase();
      if (/\.(webp|avif)(\?|$)/.test(src)) modern++;
      if (/\.(jpe?g|png|gif|bmp|tiff?)(\?|$)/.test(src)) legacy++;
    });
    if (legacy === 0) return pass("No heavy legacy raster formats detected");
    if (modern > 0) return pass("Modern formats present alongside legacy");
    return warn(`${legacy} image(s) use legacy formats without WebP/AVIF`, { legacy });
  },
});

export const filenameQualityRule = defineRule({
  id: "images-filename-quality",
  category: "images",
  severity: "low",
  weight: 3,
  title: "Descriptive image filenames",
  description: "Avoid IMG_1234.JPG style names",
  recommendation: "Use descriptive slugs in image filenames.",
  check: async ({ $ }) => {
    const bad: string[] = [];
    images($).each((_, el) => {
      const src = $(el).attr("src") ?? "";
      const file = src.split("/").pop()?.split("?")[0] ?? "";
      if (/^(img|image|photo|dsc|scan)[_-]?\d+\./i.test(file) || /^[a-f0-9]{16,}\./i.test(file)) {
        bad.push(file);
      }
    });
    if (bad.length === 0) return pass("Image filenames look descriptive");
    return warn(`${bad.length} non-descriptive filename(s)`, { samples: bad.slice(0, 6) });
  },
});

export const pictureElementRule = defineRule({
  id: "images-picture-element",
  category: "images",
  severity: "info",
  weight: 2,
  title: "Picture element usage",
  description: "Responsive art direction often uses <picture>",
  recommendation: "Consider <picture> for art direction / format switching.",
  check: async ({ $ }) => {
    const n = $("picture").length;
    if (n > 0) return pass(`${n} <picture> element(s)`);
    return pass("No <picture> elements (optional)");
  },
});

export const figureCaptionsRule = defineRule({
  id: "images-figure-captions",
  category: "images",
  severity: "low",
  weight: 2,
  title: "Figures have captions when used",
  description: "<figure> should usually include <figcaption>",
  recommendation: "Add <figcaption> to informative figures.",
  check: async ({ $ }) => {
    let missing = 0;
    $("figure").each((_, el) => {
      if ($(el).find("figcaption").length === 0) missing++;
    });
    if (missing === 0) return pass("Figures include captions (or none present)");
    return warn(`${missing} <figure> without <figcaption>`);
  },
});

export const inlineSvgSizeRule = defineRule({
  id: "images-inline-svg-size",
  category: "images",
  severity: "low",
  weight: 3,
  title: "Inline SVG size",
  description: "Huge inline SVGs bloat HTML",
  recommendation: "Move large SVGs to external files.",
  check: async ({ $ }) => {
    const heavy: number[] = [];
    $("svg").each((_, el) => {
      const html = $.html(el) ?? "";
      if (html.length > 20_000) heavy.push(html.length);
    });
    if (heavy.length === 0) return pass("No oversized inline SVGs");
    return warn(`${heavy.length} oversized inline SVG(s)`, {
      samples: heavy.slice(0, 3),
    });
  },
});

export const responsiveImagesRule = defineRule({
  id: "images-responsive",
  category: "images",
  severity: "medium",
  weight: 6,
  title: "Responsive image hints",
  description: "Content images benefit from srcset/sizes",
  recommendation: "Add srcset/sizes for content images.",
  check: async ({ $ }) => {
    const imgs = images($).toArray();
    if (imgs.length === 0) return pass("No images");
    const withSrcset = imgs.filter((el) => Boolean($(el).attr("srcset")));
    if (withSrcset.length > 0) {
      return pass(`${withSrcset.length}/${imgs.length} images use srcset`);
    }
    if (imgs.length >= 3) return warn("No srcset attributes found on images");
    return pass("Few images — srcset optional");
  },
});

const IMAGE_RULES = [
  altPresentRule,
  altQualityRule,
  altLengthRule,
  dimensionsRule,
  lazyLoadingRule,
  modernFormatRule,
  filenameQualityRule,
  pictureElementRule,
  figureCaptionsRule,
  inlineSvgSizeRule,
  responsiveImagesRule,
];

export function registerImageRules(): void {
  for (const rule of IMAGE_RULES) registerRule(rule);
}

export { IMAGE_RULES };
