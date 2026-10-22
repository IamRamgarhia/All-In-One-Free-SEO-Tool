import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

export const viewportContentRule = defineRule({
  id: "mobile-viewport-content",
  category: "mobile",
  severity: "critical",
  weight: 20,
  title: "Mobile viewport meta",
  description: "Responsive pages need width=device-width viewport",
  recommendation:
    'Use <meta name="viewport" content="width=device-width, initial-scale=1">.',
  check: async ({ $ }) => {
    const content = $('meta[name="viewport"]').attr("content") ?? "";
    if (!content) return fail("Missing viewport meta");
    if (!/width\s*=\s*device-width/i.test(content)) {
      return fail("Viewport missing width=device-width", { content });
    }
    return pass("Viewport looks mobile-friendly", { content });
  },
});

export const multipleViewportsRule = defineRule({
  id: "mobile-multiple-viewports",
  category: "mobile",
  severity: "medium",
  weight: 8,
  title: "Single viewport meta",
  description: "Duplicate viewport tags conflict",
  recommendation: "Keep only one viewport meta tag.",
  check: async ({ $ }) => {
    const n = $('meta[name="viewport"]').length;
    if (n <= 1) return pass(n === 1 ? "Single viewport" : "No viewport");
    return fail(`${n} viewport meta tags`);
  },
});

export const viewportWidthRule = defineRule({
  id: "mobile-viewport-width",
  category: "mobile",
  severity: "high",
  weight: 12,
  title: "No fixed viewport width",
  description: "Fixed pixel widths defeat responsive design",
  recommendation: "Remove fixed width values from viewport; use device-width.",
  check: async ({ $ }) => {
    const content = $('meta[name="viewport"]').attr("content") ?? "";
    if (!content) return pass("No viewport");
    if (/width\s*=\s*\d+/i.test(content) && !/device-width/i.test(content)) {
      return fail("Viewport uses fixed pixel width", { content });
    }
    return pass("Viewport width not fixed to pixels");
  },
});

export const fontSizeHintRule = defineRule({
  id: "mobile-font-size",
  category: "mobile",
  severity: "low",
  weight: 5,
  title: "Avoid tiny inline font sizes",
  description: "Inline styles under ~12px hurt mobile readability",
  recommendation: "Use minimum 16px body text; prefer rem/em.",
  check: async ({ $ }) => {
    const tiny: string[] = [];
    $("[style*='font-size']").each((_, el) => {
      const style = $(el).attr("style") ?? "";
      const m = /font-size\s*:\s*([\d.]+)px/i.exec(style);
      if (m && Number(m[1]) > 0 && Number(m[1]) < 12) tiny.push(m[0]);
    });
    if (tiny.length === 0) return pass("No tiny inline px font sizes");
    return warn(`${tiny.length} tiny inline font-size(s)`, {
      samples: tiny.slice(0, 5),
    });
  },
});

export const imageMapsRule = defineRule({
  id: "mobile-image-maps",
  category: "mobile",
  severity: "medium",
  weight: 6,
  title: "No image maps",
  description: "Image maps are hard to use on touch devices",
  recommendation: "Replace image maps with responsive links/SVG.",
  check: async ({ $ }) => {
    const n = $("map, img[usemap]").length;
    if (n === 0) return pass("No image maps");
    return warn(`Image map markup found (${n})`);
  },
});

export const interstitialsHintRule = defineRule({
  id: "mobile-interstitials",
  category: "mobile",
  severity: "low",
  weight: 4,
  title: "Intrusive interstitial heuristics",
  description: "Full-screen overlays can hurt mobile usability signals",
  recommendation: "Avoid popups that cover main content on mobile.",
  check: async ({ $ }) => {
    const suspects = $(
      '[class*="modal"],[class*="popup"],[class*="interstitial"],[id*="cookie"]',
    ).length;
    // Soft signal only — presence alone is not a fail
    if (suspects >= 8) {
      return warn(`Many overlay-like elements (${suspects})`);
    }
    return pass("No strong interstitial smell");
  },
});

const MOBILE_RULES = [
  viewportContentRule,
  multipleViewportsRule,
  viewportWidthRule,
  fontSizeHintRule,
  imageMapsRule,
  interstitialsHintRule,
];

export function registerMobileRules(): void {
  for (const rule of MOBILE_RULES) registerRule(rule);
}

export { MOBILE_RULES };
