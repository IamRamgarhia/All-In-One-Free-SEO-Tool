/**
 * Turning audit findings into tasks a person can pick up.
 *
 * WHAT WAS WRONG
 *
 * Every blueprint title named the homepage — "Fix server error on
 * homepage", "Remove noindex from homepage robots meta", "Write a meta
 * description for your homepage" — whatever page the finding was on. On
 * a real client all of them were about /cdn-cgi/l/email-protection, a
 * Cloudflare link that is not a page at all, and the task list told the
 * owner to remove a noindex from a homepage that did not have one.
 *
 * A task that names the wrong page is worse than no task: it sends
 * somebody to change something that is already correct.
 *
 * So titles now say where the problem is — "your homepage" only when the
 * finding is on the site root, the path when it is one page, and a count
 * when it is several — and infrastructure URLs never become tasks.
 */

import type { AuditFinding, Severity } from "./audit";
import { toolForFinding } from "./finding-tool-map";
import { withoutInfrastructure } from "./infrastructure-urls";

type TaskBlueprint = {
  /** `where` is "your homepage", a path such as "/about", or "12 pages". */
  title: (where: string) => string;
  whyItMatters: string;
};

const blueprints: Record<string, TaskBlueprint> = {
  fetch_failed: {
    title: () => "Investigate why your site is unreachable",
    whyItMatters:
      "If our crawler can't reach your site, Google's crawler likely can't either. This is the single biggest blocker to ranking.",
  },
  bad_status: {
    title: (where) => `Fix the error status on ${where}`,
    whyItMatters:
      "Pages returning 4xx/5xx are removed from Google's index. Restore the page to a 200 OK status before anything else.",
  },
  no_https: {
    title: () => "Migrate site to HTTPS",
    whyItMatters:
      "Google explicitly uses HTTPS as a ranking signal, and Chrome marks HTTP pages as 'Not secure'. This is table stakes.",
  },
  missing_title: {
    title: (where) => `Add a <title> tag to ${where}`,
    whyItMatters:
      "The <title> is what users see in search results — without one, Google may invent a title that doesn't represent your page.",
  },
  short_title: {
    title: (where) => `Lengthen the title on ${where} to 50–60 characters`,
    whyItMatters:
      "A short title wastes the prime real estate of your search result and underperforms more descriptive ones for clicks.",
  },
  long_title: {
    title: (where) => `Shorten the title on ${where} to under 60 characters`,
    whyItMatters:
      "Google truncates long titles in search results, often cutting off your most important words.",
  },
  missing_meta_description: {
    title: (where) => `Write a meta description for ${where}`,
    whyItMatters:
      "Google often uses your meta description in search snippets. A good 120–155 character description noticeably improves click-through rate.",
  },
  short_meta_description: {
    title: (where) => `Expand the meta description on ${where} to 120–155 characters`,
    whyItMatters:
      "A too-short description wastes available pixels in search snippets and is less persuasive than a fuller one.",
  },
  long_meta_description: {
    title: (where) => `Shorten the meta description on ${where} to under 160 characters`,
    whyItMatters:
      "Long descriptions get truncated mid-sentence in search results, which looks unprofessional.",
  },
  missing_h1: {
    title: (where) => `Add a clear <h1> heading to ${where}`,
    whyItMatters:
      "The H1 tells users and search engines what the page is about at a glance. Pages without H1s feel unstructured.",
  },
  missing_canonical: {
    title: (where) => `Add a canonical link to ${where}`,
    whyItMatters:
      "Without a canonical, Google guesses which URL is the 'real' one, sometimes choosing wrong and splitting your ranking signals.",
  },
  missing_viewport: {
    title: (where) => `Add a viewport meta tag to ${where}`,
    whyItMatters:
      "Without viewport meta, your page won't render correctly on phones — and Google now indexes mobile-first.",
  },
  noindex_set: {
    title: (where) => `Remove noindex from ${where}`,
    whyItMatters:
      "The page is explicitly telling Google not to index it. That is almost always a mistake left over from staging — check it was not deliberate, then remove it.",
  },
  missing_lang: {
    title: (where) => `Add a lang attribute to <html> on ${where}`,
    whyItMatters:
      "Declares the page language to search engines and screen readers. A small fix that helps both.",
  },
  missing_favicon: {
    title: () => "Add a favicon",
    whyItMatters:
      "Favicons appear next to your site in browser tabs and search results — small visual brand cue that adds polish.",
  },
  missing_og_tags: {
    title: (where) => `Add Open Graph tags to ${where}`,
    whyItMatters:
      "Without OG tags, when someone shares your site on Slack/LinkedIn/Facebook the preview is unbranded and unappealing.",
  },
  missing_image_alt: {
    title: (where) => `Add alt text to images on ${where}`,
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
  /** The finding type, so callers can make task creation idempotent. */
  type: string;
  title: string;
  description: string;
  whyItMatters: string;
  priority: "high" | "medium" | "low";
  /**
   * Where to go and fix it, or null when no tool helps.
   *
   * Null is a real answer and the common one for platform findings — a
   * Next.js issue is fixed in that repo, not here — and a button opening
   * something irrelevant costs the click and the trust.
   */
  toolPath: string | null;
};

/**
 * Where a set of findings is, in words a person reads.
 *
 * "your homepage" only when the only page involved is the site root.
 * Exported for the test, which exists because the previous titles said
 * homepage unconditionally.
 */
export function placeOf(urls: readonly string[]): string {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length > 1) return `${unique.length} pages`;
  const url = unique[0];
  if (!url) return "the site";
  try {
    const path = new URL(url).pathname;
    return path === "/" || path === "" ? "your homepage" : path;
  } catch {
    return url;
  }
}

export function findingsToTasks(findings: AuditFinding[]): GeneratedTask[] {
  // Infrastructure first, low severity second. One task per finding
  // type, not per page: "Write a meta description for 34 pages" is a job
  // somebody picks up, and thirty-four separate tasks is a backlog nobody
  // opens twice.
  const real = withoutInfrastructure(findings).filter((f) => f.severity !== "low");

  const byType = new Map<string, AuditFinding[]>();
  for (const f of real) {
    byType.set(f.type, [...(byType.get(f.type) ?? []), f]);
  }

  return Array.from(byType.entries()).map(([type, list]) => {
    const worst = list.reduce((a, b) =>
      severityRank(b.severity) > severityRank(a.severity) ? b : a,
    );
    const blueprint = blueprints[type];
    // With several pages the description lists them, so the task says
    // which pages rather than leaving the reader to re-run the audit.
    const description =
      list.length > 1
        ? list
            .slice(0, 20)
            .map((f) => `- ${f.url}\n  ${f.message}`)
            .join("\n")
        : worst.message;

    if (!blueprint) {
      const note = list.length > 1 ? ` (affects ${list.length} pages)` : "";
      return {
        type,
        title: (worst.message.split(".")[0] ?? type) + note,
        description,
        whyItMatters: worst.message,
        priority: severityToPriority[worst.severity],
        // Null for anything with no tool that helps, which is honest —
        // a button opening something irrelevant costs the click and the
        // trust. See finding-tool-map.ts.
        toolPath: toolForFinding(type),
      };
    }
    return {
      type,
      title: blueprint.title(placeOf(list.map((f) => f.url))),
      description,
      whyItMatters: blueprint.whyItMatters,
      priority: severityToPriority[worst.severity],
      toolPath: toolForFinding(type),
    };
  });
}

function severityRank(s: Severity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s];
}
