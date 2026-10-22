import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

export const formLabelsRule = defineRule({
  id: "a11y-form-labels",
  category: "a11y",
  severity: "high",
  weight: 12,
  title: "Form inputs have labels",
  description: "Inputs need associated labels or aria-label",
  recommendation: 'Add <label for="id"> or aria-label to form inputs.',
  check: async ({ $ }) => {
    const missing: string[] = [];
    $("input,select,textarea").each((_, el) => {
      const type = (($(el).attr("type") ?? "text") as string).toLowerCase();
      if (["hidden", "submit", "button", "reset", "image"].includes(type)) return;
      const id = $(el).attr("id");
      const aria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
      const hasLabel = id ? $(`label[for="${id}"]`).length > 0 : false;
      const wrapped = $(el).closest("label").length > 0;
      if (!aria && !hasLabel && !wrapped) {
        missing.push($(el).attr("name") || type || "input");
      }
    });
    if (missing.length === 0) return pass("Form controls are labeled");
    return fail(`${missing.length} unlabeled control(s)`, {
      samples: missing.slice(0, 8),
    });
  },
});

export const landmarkRegionsRule = defineRule({
  id: "a11y-landmark-regions",
  category: "a11y",
  severity: "medium",
  weight: 8,
  title: "Landmark regions",
  description: "Pages should expose main/nav/header/footer landmarks",
  recommendation: "Add <main>, <nav>, <header>, <footer> landmarks.",
  check: async ({ $ }) => {
    const found = {
      main: $("main,[role='main']").length,
      nav: $("nav,[role='navigation']").length,
      header: $("header,[role='banner']").length,
      footer: $("footer,[role='contentinfo']").length,
    };
    const missing = Object.entries(found)
      .filter(([, n]) => n === 0)
      .map(([k]) => k);
    if (missing.length === 0) return pass("Core landmarks present");
    if (missing.includes("main")) {
      return warn(`Missing landmarks: ${missing.join(", ")}`, found);
    }
    return warn(`Missing landmarks: ${missing.join(", ")}`, found);
  },
});

export const mainLandmarkRule = defineRule({
  id: "a11y-main-landmark",
  category: "a11y",
  severity: "medium",
  weight: 8,
  title: "Exactly one main landmark",
  description: "Primary content should live in a single <main>",
  recommendation: "Add exactly one <main> wrapping primary content.",
  check: async ({ $ }) => {
    const n = $("main,[role='main']").length;
    if (n === 1) return pass("Single main landmark");
    if (n === 0) return warn("No main landmark");
    return fail(`${n} main landmarks`);
  },
});

export const linkTextRule = defineRule({
  id: "a11y-link-text",
  category: "a11y",
  severity: "medium",
  weight: 9,
  title: "Descriptive link text",
  description: "Avoid generic anchors like click here / read more",
  recommendation: 'Use descriptive link text instead of "click here".',
  check: async ({ $ }) => {
    const bad: string[] = [];
    const generic = /^(click here|here|read more|more|learn more|link)$/i;
    $("a[href]").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const aria = $(el).attr("aria-label")?.trim();
      const label = aria || text;
      if (!label) return;
      if (generic.test(label)) bad.push(label);
    });
    if (bad.length === 0) return pass("Link text looks descriptive");
    return warn(`${bad.length} generic link(s)`, { samples: bad.slice(0, 6) });
  },
});

export const skipLinkRule = defineRule({
  id: "a11y-skip-link",
  category: "a11y",
  severity: "low",
  weight: 5,
  title: "Skip-to-content link",
  description: "Keyboard users benefit from a skip link",
  recommendation: "Add a skip-to-content link at the top of the page.",
  check: async ({ $ }) => {
    const firstLinks = $("a[href^='#']").toArray().slice(0, 5);
    const skip = firstLinks.some((el) =>
      /skip|contenu|content|main/i.test($(el).text() + ($(el).attr("href") ?? "")),
    );
    if (skip) return pass("Skip link detected");
    return warn("No skip-to-content link near top of page");
  },
});

export const iframeTitleRule = defineRule({
  id: "a11y-iframe-title",
  category: "a11y",
  severity: "medium",
  weight: 7,
  title: "Iframes have titles",
  description: "Frames need descriptive title attributes",
  recommendation: "Add a descriptive title to every <iframe>.",
  check: async ({ $ }) => {
    const missing: string[] = [];
    $("iframe").each((_, el) => {
      if (!($(el).attr("title") || $(el).attr("aria-label"))) {
        missing.push($(el).attr("src") ?? "(iframe)");
      }
    });
    if (missing.length === 0) return pass("Iframes titled (or none)");
    return fail(`${missing.length} iframe(s) without title`, {
      samples: missing.slice(0, 5),
    });
  },
});

export const buttonNameRule = defineRule({
  id: "a11y-button-name",
  category: "a11y",
  severity: "high",
  weight: 10,
  title: "Buttons have accessible names",
  description: "Buttons need visible text, aria-label, or image alt",
  recommendation: "Give each button an accessible name.",
  check: async ({ $ }) => {
    const missing: string[] = [];
    $("button, [role='button']").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const aria = $(el).attr("aria-label") || $(el).attr("aria-labelledby");
      const imgAlt = $(el).find("img[alt]").attr("alt");
      if (!text && !aria && !imgAlt) missing.push($(el).attr("class") ?? "button");
    });
    if (missing.length === 0) return pass("Buttons have names");
    return fail(`${missing.length} unnamed button(s)`, {
      samples: missing.slice(0, 6),
    });
  },
});

export const duplicateIdRule = defineRule({
  id: "a11y-duplicate-id",
  category: "a11y",
  severity: "high",
  weight: 10,
  title: "Unique id attributes",
  description: "Duplicate IDs break labels and ARIA references",
  recommendation: "Make every id attribute unique.",
  check: async ({ $ }) => {
    const seen = new Map<string, number>();
    $("[id]").each((_, el) => {
      const id = $(el).attr("id") ?? "";
      if (!id) return;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    });
    const dups = Array.from(seen.entries())
      .filter(([, n]) => n > 1)
      .map(([id]) => id);
    if (dups.length === 0) return pass("All ids unique");
    return fail(`${dups.length} duplicate id(s)`, { samples: dups.slice(0, 8) });
  },
});

export const emptyHeadingRule = defineRule({
  id: "a11y-empty-heading",
  category: "a11y",
  severity: "medium",
  weight: 6,
  title: "No empty headings",
  description: "Headings must have accessible text",
  recommendation: "Remove empty headings or give them text.",
  check: async ({ $ }) => {
    let empty = 0;
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      if (!$(el).text().replace(/\s+/g, " ").trim()) empty += 1;
    });
    if (empty === 0) return pass("No empty headings");
    return warn(`${empty} empty heading(s)`);
  },
});

export const zoomDisabledRule = defineRule({
  id: "a11y-zoom-disabled",
  category: "a11y",
  severity: "high",
  weight: 9,
  title: "Zoom not disabled",
  description: "user-scalable=no / maximum-scale=1 blocks accessibility zoom",
  recommendation: "Remove user-scalable=no and maximum-scale=1 from viewport.",
  check: async ({ $ }) => {
    const content = ($('meta[name="viewport"]').attr("content") ?? "").toLowerCase();
    if (!content) return pass("No viewport meta");
    if (/user-scalable\s*=\s*no/.test(content) || /maximum-scale\s*=\s*1([^\d.]|$)/.test(content)) {
      return fail("Viewport disables zoom", { content });
    }
    return pass("Viewport allows zoom");
  },
});

export const tabindexPositiveRule = defineRule({
  id: "a11y-tabindex-positive",
  category: "a11y",
  severity: "medium",
  weight: 6,
  title: "No positive tabindex",
  description: "Positive tabindex breaks natural tab order",
  recommendation: 'Use tabindex="0" or remove tabindex.',
  check: async ({ $ }) => {
    const bad: string[] = [];
    $("[tabindex]").each((_, el) => {
      const v = Number($(el).attr("tabindex"));
      if (Number.isFinite(v) && v > 0) bad.push(String(v));
    });
    if (bad.length === 0) return pass("No positive tabindex");
    return warn(`${bad.length} element(s) with positive tabindex`);
  },
});

export const tableHeadersRule = defineRule({
  id: "a11y-table-headers",
  category: "a11y",
  severity: "medium",
  weight: 6,
  title: "Data tables have headers",
  description: "Tables should use <th> for headers",
  recommendation: "Add <th scope=\"col/row\"> to data tables.",
  check: async ({ $ }) => {
    const tables = $("table").toArray();
    if (tables.length === 0) return pass("No tables");
    const missing = tables.filter((el) => $(el).find("th").length === 0);
    if (missing.length === 0) return pass("Tables have th headers");
    return warn(`${missing.length}/${tables.length} table(s) without <th>`);
  },
});

export const htmlLangRule = defineRule({
  id: "a11y-valid-lang-element",
  category: "a11y",
  severity: "medium",
  weight: 5,
  title: "Valid lang on <html>",
  description: "lang should be a well-formed BCP 47 tag",
  recommendation: 'Use well-formed language tags (e.g. "en", "fr-FR").',
  check: async ({ $ }) => {
    const lang = $("html").attr("lang")?.trim() ?? "";
    if (!lang) return warn("Missing html lang attribute");
    if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(lang)) {
      return fail(`Malformed lang="${lang}"`);
    }
    return pass(`html lang="${lang}"`);
  },
});

const A11Y_RULES = [
  formLabelsRule,
  landmarkRegionsRule,
  mainLandmarkRule,
  linkTextRule,
  skipLinkRule,
  iframeTitleRule,
  buttonNameRule,
  duplicateIdRule,
  emptyHeadingRule,
  zoomDisabledRule,
  tabindexPositiveRule,
  tableHeadersRule,
  htmlLangRule,
];

export function registerAccessibilityRules(): void {
  for (const rule of A11Y_RULES) registerRule(rule);
}

export { A11Y_RULES };
