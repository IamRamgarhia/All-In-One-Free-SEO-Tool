import type { AuditFinding, Severity } from "./audit";

type TaskBlueprint = {
  title: string;
  whyItMatters: string;
};

const blueprints: Record<string, TaskBlueprint> = {
  fetch_failed: {
    title: "Investigate why your site is unreachable",
    whyItMatters:
      "If our crawler can't reach your site, Google's crawler likely can't either. This is the single biggest blocker to ranking.",
  },
  bad_status: {
    title: "Fix server error on homepage",
    whyItMatters:
      "Pages returning 4xx/5xx are removed from Google's index. Restore the page to a 200 OK status before anything else.",
  },
  no_https: {
    title: "Migrate site to HTTPS",
    whyItMatters:
      "Google explicitly uses HTTPS as a ranking signal, and Chrome marks HTTP pages as 'Not secure'. This is table stakes.",
  },
  missing_title: {
    title: "Add a <title> tag to your homepage",
    whyItMatters:
      "The <title> is what users see in search results — without one, Google may invent a title that doesn't represent your page.",
  },
  short_title: {
    title: "Lengthen homepage title to 50–60 characters",
    whyItMatters:
      "A short title wastes the prime real estate of your search result and underperforms more descriptive ones for clicks.",
  },
  long_title: {
    title: "Shorten homepage title to under 60 characters",
    whyItMatters:
      "Google truncates long titles in search results, often cutting off your most important words.",
  },
  missing_meta_description: {
    title: "Write a meta description for your homepage",
    whyItMatters:
      "Google often uses your meta description in search snippets. A good 120–155 character description noticeably improves click-through rate.",
  },
  short_meta_description: {
    title: "Expand meta description to 120–155 characters",
    whyItMatters:
      "A too-short description wastes available pixels in search snippets and is less persuasive than a fuller one.",
  },
  long_meta_description: {
    title: "Shorten meta description to under 160 characters",
    whyItMatters:
      "Long descriptions get truncated mid-sentence in search results, which looks unprofessional.",
  },
  missing_h1: {
    title: "Add a clear <h1> heading to your homepage",
    whyItMatters:
      "The H1 tells users and search engines what the page is about at a glance. Pages without H1s feel unstructured.",
  },
  missing_canonical: {
    title: "Add a canonical link to your homepage",
    whyItMatters:
      "Without a canonical, Google guesses which URL is the 'real' one, sometimes choosing wrong and splitting your ranking signals.",
  },
  missing_viewport: {
    title: "Add a viewport meta tag for mobile",
    whyItMatters:
      "Without viewport meta, your page won't render correctly on phones — and Google now indexes mobile-first.",
  },
  noindex_set: {
    title: "Remove noindex from homepage robots meta",
    whyItMatters:
      "Right now you're explicitly telling Google not to index your homepage. This is almost always a mistake left over from staging.",
  },
  missing_lang: {
    title: "Add a lang attribute to <html>",
    whyItMatters:
      "Declares the page language to search engines and screen readers. A small fix that helps both.",
  },
  missing_favicon: {
    title: "Add a favicon",
    whyItMatters:
      "Favicons appear next to your site in browser tabs and search results — small visual brand cue that adds polish.",
  },
  missing_og_tags: {
    title: "Add OpenGraph tags for social sharing",
    whyItMatters:
      "Without OG tags, when someone shares your site on Slack/LinkedIn/Facebook the preview is unbranded and unappealing.",
  },
  missing_image_alt: {
    title: "Add alt text to images missing it",
    whyItMatters:
      "Alt text helps screen readers, image search, and gives Google more context about the page's topic.",
  },
};

const severityToPriority: Record<Severity, "high" | "medium" | "low"> = {
  critical: "high",
  high: "high",
  medium: "medium",
  low: "low",
};

export type GeneratedTask = {
  title: string;
  description: string;
  whyItMatters: string;
  priority: "high" | "medium" | "low";
};

export function findingsToTasks(findings: AuditFinding[]): GeneratedTask[] {
  // Multi-page audits generate many findings of the same type (e.g., 10×
  // missing_canonical). Deduplicate by type so we get one task per issue
  // type, not per occurrence.
  const seen = new Map<string, AuditFinding>();
  for (const f of findings) {
    if (f.severity === "low") continue;
    const existing = seen.get(f.type);
    if (!existing || severityRank(f.severity) > severityRank(existing.severity)) {
      seen.set(f.type, f);
    }
  }

  // Count occurrences per type for the description
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (f.severity === "low") continue;
    counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  }

  return Array.from(seen.values()).map((f) => {
    const blueprint = blueprints[f.type];
    const occurrences = counts.get(f.type) ?? 1;
    const occurrenceNote =
      occurrences > 1 ? ` (affects ${occurrences} pages)` : "";
    if (!blueprint) {
      return {
        title: (f.message.split(".")[0] ?? f.type) + occurrenceNote,
        description: f.message,
        whyItMatters: f.message,
        priority: severityToPriority[f.severity],
      };
    }
    return {
      title: blueprint.title + occurrenceNote,
      description: f.message,
      whyItMatters: blueprint.whyItMatters,
      priority: severityToPriority[f.severity],
    };
  });
}

function severityRank(s: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s];
}
