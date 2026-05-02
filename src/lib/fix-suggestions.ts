export type Suggestion = {
  value: string;
  rationale: string;
  charCount?: number;
};

const FIXABLE_TYPES = new Set([
  "missing_title",
  "short_title",
  "long_title",
  "missing_meta_description",
  "short_meta_description",
  "long_meta_description",
  "missing_h1",
  "missing_canonical",
  "missing_viewport",
]);

export function isFixable(issueType: string): boolean {
  return FIXABLE_TYPES.has(issueType);
}

const TARGET_TITLE_MIN = 50;
const TARGET_TITLE_MAX = 60;
const TARGET_DESC_MIN = 120;
const TARGET_DESC_MAX = 155;

function smartTrim(text: string, max: number): string {
  if (text.length <= max) return text;
  // Trim at last word boundary before max
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

function brandFromHostname(hostname: string): string {
  const parts = hostname.replace(/^www\./, "").split(".");
  if (parts.length === 0) return "";
  const first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// ─── Title fixes ─────────────────────────────────────────────────────────

export function suggestTitleFixes(opts: {
  currentTitle: string | null;
  h1: string | null;
  hostname: string;
  description: string | null;
}): Suggestion[] {
  const brand = brandFromHostname(opts.hostname);
  const out: Suggestion[] = [];

  // 1. If title missing or too short, build from H1 or description
  if (!opts.currentTitle || opts.currentTitle.length < TARGET_TITLE_MIN) {
    if (opts.h1) {
      const v1 = smartTrim(`${opts.h1} | ${brand}`, TARGET_TITLE_MAX);
      out.push({
        value: v1,
        rationale: "Built from your H1 plus brand suffix.",
        charCount: v1.length,
      });
    }
    if (opts.description) {
      const fromDesc = smartTrim(opts.description, TARGET_TITLE_MAX);
      out.push({
        value: fromDesc,
        rationale: "Distilled from your meta description.",
        charCount: fromDesc.length,
      });
    }
    if (opts.h1 && brand) {
      const v3 = smartTrim(`${brand} — ${opts.h1}`, TARGET_TITLE_MAX);
      out.push({
        value: v3,
        rationale: "Brand-led: best when brand is well-known.",
        charCount: v3.length,
      });
    }
  }

  // 2. If title too long, propose smart-trimmed version
  if (opts.currentTitle && opts.currentTitle.length > TARGET_TITLE_MAX) {
    const trimmed = smartTrim(opts.currentTitle, TARGET_TITLE_MAX);
    out.push({
      value: trimmed,
      rationale: "Trimmed to fit within Google's display limit.",
      charCount: trimmed.length,
    });
    // Try removing brand suffix if there's a separator
    const sepMatch = opts.currentTitle.match(/(.+?)\s*[|—-]\s*(.+)/);
    if (sepMatch && sepMatch[1].length >= TARGET_TITLE_MIN) {
      const noBrand = sepMatch[1].trim();
      out.push({
        value: noBrand,
        rationale:
          "Brand suffix removed — only do this if your brand is well-known enough to skip.",
        charCount: noBrand.length,
      });
    }
  }

  // 3. If title is okay, we still suggest one alternate phrasing pattern
  if (
    opts.currentTitle &&
    opts.currentTitle.length >= TARGET_TITLE_MIN &&
    opts.currentTitle.length <= TARGET_TITLE_MAX
  ) {
    const alt = `${opts.currentTitle.split(/[|—-]/)[0].trim()} (2026 Guide)`;
    if (alt.length <= TARGET_TITLE_MAX) {
      out.push({
        value: alt,
        rationale: "Optional: a year/freshness modifier nudges CTR.",
        charCount: alt.length,
      });
    }
  }

  return out.filter(
    (s) => s.value && s.value.length >= 10 && s.value.length <= 80,
  );
}

// ─── Meta description fixes ──────────────────────────────────────────────

export function suggestMetaDescriptionFixes(opts: {
  currentDescription: string | null;
  title: string | null;
  h1: string | null;
  firstParagraph: string | null;
  hostname: string;
}): Suggestion[] {
  const brand = brandFromHostname(opts.hostname);
  const out: Suggestion[] = [];

  // 1. Missing or short → generate from first paragraph
  if (
    !opts.currentDescription ||
    opts.currentDescription.length < TARGET_DESC_MIN
  ) {
    if (opts.firstParagraph) {
      const v = smartTrim(opts.firstParagraph, TARGET_DESC_MAX);
      if (v.length >= TARGET_DESC_MIN) {
        out.push({
          value: v,
          rationale: "Distilled from your opening paragraph.",
          charCount: v.length,
        });
      }
    }
    if (opts.h1 && opts.firstParagraph) {
      const merged = smartTrim(
        `${opts.h1}. ${opts.firstParagraph}`,
        TARGET_DESC_MAX,
      );
      if (merged.length >= TARGET_DESC_MIN) {
        out.push({
          value: merged,
          rationale: "Hook with H1, expand with first paragraph.",
          charCount: merged.length,
        });
      }
    }
    if (opts.title && brand) {
      const tmpl = smartTrim(
        `${opts.title} from ${brand}. Learn more about what we offer and how we can help you achieve your goals.`,
        TARGET_DESC_MAX,
      );
      out.push({
        value: tmpl,
        rationale: "Generic template — replace the second sentence with a real value prop.",
        charCount: tmpl.length,
      });
    }
  }

  // 2. Too long → smart trim
  if (
    opts.currentDescription &&
    opts.currentDescription.length > TARGET_DESC_MAX
  ) {
    const trimmed = smartTrim(opts.currentDescription, TARGET_DESC_MAX);
    out.push({
      value: trimmed,
      rationale: "Trimmed to under 160 characters at a clean word boundary.",
      charCount: trimmed.length,
    });
  }

  return out.filter(
    (s) => s.value && s.value.length >= 50 && s.value.length <= 200,
  );
}

// ─── H1 fix ──────────────────────────────────────────────────────────────

export function suggestH1Fix(opts: {
  title: string | null;
  hostname: string;
}): Suggestion[] {
  const out: Suggestion[] = [];
  if (opts.title) {
    // Strip brand suffix from title for cleaner H1
    const sepMatch = opts.title.match(/(.+?)\s*[|—-]\s*(.+)/);
    const cleaned = sepMatch ? sepMatch[1].trim() : opts.title;
    out.push({
      value: cleaned,
      rationale:
        "Your <title> minus the brand suffix — H1 should be user-focused, title is search-focused.",
    });
    out.push({
      value: opts.title,
      rationale: "Keep H1 identical to <title>. Simple and consistent.",
    });
  } else {
    out.push({
      value: `Welcome to ${brandFromHostname(opts.hostname)}`,
      rationale:
        "Generic placeholder — replace with the actual page topic.",
    });
  }
  return out;
}

// ─── Canonical fix ───────────────────────────────────────────────────────

export function suggestCanonicalFix(pageUrl: string): Suggestion[] {
  // Use the page's URL as the canonical (most common case)
  return [
    {
      value: `<link rel="canonical" href="${pageUrl}">`,
      rationale:
        "Self-canonical — tells Google this is the preferred URL for this page.",
    },
  ];
}

// ─── Viewport fix ────────────────────────────────────────────────────────

export function suggestViewportFix(): Suggestion[] {
  return [
    {
      value: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      rationale:
        "Standard viewport — works for 99% of sites. Add to <head> on every page.",
    },
    {
      value: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">`,
      rationale:
        "Allows pinch-to-zoom up to 5x. Better accessibility than locking zoom.",
    },
  ];
}
