/**
 * 30-day SEO calendar generator. Produces a deterministic plan based on:
 *
 *   - **Niche** (local / e-commerce / SaaS / blog / services)
 *   - **Tech stack** (WordPress / Shopify / Next.js etc.) — drives implementation hints
 *   - **Country & city** — drives citation directories, local rank focus
 *   - **GSC data** (when connected) — surfaces real quick wins + decay candidates
 *   - **Audit findings** (latest audit) — turns critical/high issues into early-week tasks
 *   - **GBP** — every client gets a baseline of GBP weekly tasks (review reply, post, photos)
 *
 * Output is ~30 daily task objects ready to insert into the tasks table.
 * Days mostly map to one focus area but balance technical / content / off-page
 * across the month so the user is never grinding the same thing all week.
 */

import { addDays, startOfDay } from "./utils-date";
import { blueprintsFr, placeFr } from "./audit-to-task.fr";
import { ruleNamesFr } from "./rule-names.fr";
import { CALENDAR_FR, CRAWLER_FIX_FR, severityRationaleFr } from "./seo-calendar.fr";

export type CalendarTask = {
  /** 1..30 */
  day: number;
  date: Date;
  title: string;
  whyItMatters: string;
  category: TaskCategory;
  priority: "high" | "medium" | "low";
  estimatedMinutes: number;
  /** Optional URL to deep-link to inside the app. */
  toolPath?: string;
};

export type TaskCategory =
  | "technical"
  | "content"
  | "keywords"
  | "local"
  | "gbp"
  | "links"
  | "tracking"
  | "ai_visibility"
  | "review";

export type CalendarInput = {
  clientId: number;
  clientName: string;
  niche: "local" | "ecommerce" | "saas" | "blog" | "services" | null;
  techStack: string[];
  country: string;
  city: string | null;
  hasGsc: boolean;
  hasGbp: boolean;
  /** Top 3 quick-win keywords from GSC (positions 4-15). */
  quickWins?: { query: string; impressions: number; position: number }[];
  /** Highest-severity outstanding audit issues (summariseTopIssues). */
  topIssues?: TopIssue[];
  /** A crawl audit already exists: day 2 reviews it instead of running one. */
  hasAudit?: boolean;
  /** Workspace language; French writes every step in French. */
  locale?: "fr" | "en";
  /** Niche-aware seed for content tasks. */
  contentSeeds?: string[];
  /** Optional start date — defaults to tomorrow. */
  startDate?: Date;
};

export type TopIssue = {
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  /** Finding type, e.g. `long_title` or `seomator:eeat-author-byline`. */
  type?: string;
  /** Pages it was found on. */
  pages?: number;
  /** The page, when there is only one. */
  url?: string | null;
};

/**
 * The worst open audit findings, one per type, for the calendar.
 *
 * Built from raw audit rows, which are one per page. Taking them as they
 * came put "Fix: 10 images use legacy formats" on consecutive days of a
 * real client's plan — the same finding on different pages, identical
 * tasks, and no way to tell them apart because the title did not say
 * which page. A per-page figure like "10 images" is also dropped when
 * pages are combined, because it describes one page and would read as
 * the total.
 */
export function summariseTopIssues(
  rows: readonly { severity: string; type: string; message: string | null; url?: string | null }[],
  limit = 5,
): TopIssue[] {
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const byType = new Map<string, { type: string; severity: string; message: string; pages: number; url: string | null }>();
  for (const r of rows) {
    const cur = byType.get(r.type);
    if (!cur) {
      byType.set(r.type, { type: r.type, severity: r.severity, message: r.message ?? r.type, pages: 1, url: r.url ?? null });
      continue;
    }
    cur.pages++;
    if ((rank[r.severity] ?? 9) < (rank[cur.severity] ?? 9)) {
      cur.severity = r.severity;
      cur.message = r.message ?? r.type;
    }
  }
  return [...byType.values()]
    .sort(
      (a, b) =>
        (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || b.pages - a.pages,
    )
    .slice(0, limit)
    .map((i) => ({
      severity: i.severity as "critical" | "high" | "medium" | "low",
      type: i.type,
      pages: i.pages,
      url: i.pages === 1 ? i.url : null,
      title:
        i.pages > 1
          ? `${issueHeadline(i.message, true)} (${i.pages} pages)`
          : issueHeadline(i.message, false),
    }));
}

/**
 * Advice following a dash, which a headline can drop.
 *
 * Crawler messages come in two shapes. In "10 images use legacy formats
 * — convert to WebP/AVIF" the dash separates the problem from the advice.
 * In "LCP 2.97s — over the 2.5s threshold" the part after the dash IS the
 * problem. Cutting at every dash turned the second into "Fix: LCP 2.97s",
 * which says nothing about what is wrong — caught in a dry run against a
 * real client's plan, before it was written back.
 */
const ADVICE_AFTER_DASH =
  /^(convert|add|fix|remove|use|compress|shorten|lengthen|trim|write|set|enable|disable|update|replace|move|reduce|include|check|consider|serve|lazy-load|defer|minify)\b/i;

/** The problem a finding message states, with a per-page count removed when combined. */
function issueHeadline(message: string, combined: boolean): string {
  let s = (message.split(/\.\s/)[0] ?? message).trim().replace(/\.$/, "");
  const dash = s.match(/^(.*?)\s[—-]\s(.*)$/);
  if (dash && ADVICE_AFTER_DASH.test(dash[2])) s = dash[1].trim();
  if (combined) s = s.replace(/^\d[\d,]*\s+/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Why a finding matters, in proportion to how much it does.
 *
 * Every audit task used to carry the same sentence — "Open issues at
 * this level cap how much downstream work can move rankings" — low
 * severity included. On a real client, once Cloudflare false positives
 * were removed, every remaining finding was low: heading order, image
 * formats, a long meta description. Telling a client those cap their
 * rankings is untrue, and a plan that overstates its own urgency is one
 * they stop trusting by the second week.
 */
export function severityRationale(severity: string): string {
  switch (severity) {
    case "critical":
      return "Critical. This can stop pages being indexed or ranking at all, so it comes before anything else.";
    case "high":
      return "High impact. Worth fixing before content work, because it weakens pages that already exist.";
    case "medium":
      return "Worth fixing. It will not block rankings on its own, but it costs clicks or clarity.";
    default:
      return "Low severity. A tidy-up rather than a ranking problem — fix it once the higher-impact work is done.";
  }
}

export function generateCalendar(input: CalendarInput): CalendarTask[] {
  const start = input.startDate ?? startOfDay(addDays(new Date(), 1));
  const cal: CalendarTask[] = [];
  const fr = input.locale === "fr";

  // ============== Week 1: Foundation + Audit-driven fixes ==============
  push(cal, {
    day: 1,
    date: addDays(start, 0),
    title: input.hasGsc
      ? "Review GSC: Coverage errors and indexing issues"
      : "Connect Google Search Console (10 min — unlocks half the tool)",
    whyItMatters: input.hasGsc
      ? "Indexing issues block ranking. Catch them now and fix before content work compounds the problem."
      : "GSC is free, takes 10 minutes, and unlocks real keyword + traffic data the rest of the plan depends on.",
    category: "tracking",
    priority: "high",
    estimatedMinutes: input.hasGsc ? 25 : 15,
    toolPath: input.hasGsc ? "/clients" : "/settings/google",
  });

  push(cal, {
    day: 2,
    date: addDays(start, 1),
    // The quick audit runs when the client is added, so "run a full site
    // audit" on day 2 asked for work already done.
    title: input.hasAudit
      ? "Review the site audit and pick the fixes to make first"
      : "Run a full site audit + log critical issues",
    whyItMatters: input.hasAudit
      ? "The baseline audit is done: keep what blocks indexing or trust, the rest can wait."
      : "A baseline audit means every later improvement is measurable. Critical issues (broken indexability, mobile-fail, no sitemap) outweigh content work.",
    category: "technical",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: "/audits",
  });

  // Days 3-5: top audit issues (use real if we have them, else generic)
  const issuesForCalendar = (input.topIssues ?? []).slice(0, 3);
  for (let i = 0; i < 3; i++) {
    const issue = issuesForCalendar[i];
    push(cal, {
      day: 3 + i,
      date: addDays(start, 2 + i),
      title: issue
        ? fr
          ? issueTitleFr(issue)
          : `Fix: ${issue.title}`
        : ["Audit + fix all broken meta titles", "Audit image alt-text gaps", "Check & resolve mobile-friendliness errors"][i],
      // The fallback used to promise "every later content win 10-20%
      // bigger" — a figure with no source, in a document sent to clients.
      whyItMatters: issue
        ? fr
          ? severityRationaleFr(issue.severity)
          : severityRationale(issue.severity)
        : "Technical problems left open undercut the content work built on top of them, so they go first.",
      category: "technical",
      priority:
        issue?.severity === "critical" || issue?.severity === "high"
          ? "high"
          : issue?.severity === "low"
            ? "low"
            : "medium",
      estimatedMinutes: 45,
      toolPath: "/audits",
    });
  }

  push(cal, {
    day: 6,
    date: addDays(start, 5),
    title: "Site-wide internal linking audit + fix orphan pages",
    whyItMatters:
      "Internal links pass authority and tell Google what's important. Orphan pages get crawled less and rank worse.",
    category: "technical",
    priority: "medium",
    estimatedMinutes: 40,
    toolPath: "/tools/internal-linking",
  });

  push(cal, {
    day: 7,
    date: addDays(start, 6),
    title: "Generate sitemap.xml + submit to Bing/IndexNow",
    whyItMatters:
      "An up-to-date sitemap helps engines find new pages; IndexNow tells Bing about new URLs the same day.",
    category: "technical",
    priority: "medium",
    estimatedMinutes: 15,
    toolPath: "/tools/sitemap",
  });

  // ============== Week 2: Keyword + Content sprint ==============
  push(cal, {
    day: 8,
    date: addDays(start, 7),
    title: input.hasGsc
      ? "Pull GSC striking-distance keywords (positions 4-15)"
      : "Run keyword research from your top competitor + autocomplete fan-out",
    whyItMatters:
      "Keywords already on page two need the least work to move, which makes them the best return on a week of effort.",
    category: "keywords",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: input.hasGsc ? `/clients/${input.clientId}` : "/keywords",
  });

  // Days 9-11: one refresh task per real quick win.
  //
  // With no quick wins this produced three tasks — "Write content brief
  // #1", "#2", "#3" — with the same explanation word for word, which is
  // one piece of work padded into three lines of a client's plan. Now a
  // real opportunity gets its own task, and without any there is one.
  const wins = (input.quickWins ?? []).slice(0, 3);
  wins.forEach((win, i) => {
    push(cal, {
      day: 9 + i,
      date: addDays(start, 8 + i),
      title: fr
        ? `Mettre à jour la page positionnée sur « ${win.query} » (actuellement n° ${Math.round(win.position)})`
        : `Refresh page ranking for "${win.query}" (currently #${Math.round(win.position)})`,
      whyItMatters: fr
        ? `${win.impressions.toLocaleString("fr-FR")} impressions sur 28 jours et déjà en deuxième page : un ajustement de l’intention ou des titres peut la faire passer en première page.`
        : `${win.impressions.toLocaleString("en-US")} impressions over 28 days and already on page 2. A small intent / heading update can push it onto page 1.`,
      category: "content",
      priority: "high",
      estimatedMinutes: 60,
      toolPath: `/content/c/${input.clientId}`,
    });
  });
  if (wins.length === 0) {
    push(cal, {
      day: 9,
      date: addDays(start, 8),
      title: "Write 3 content briefs for your best keyword opportunities",
      whyItMatters:
        "Targeting a real ranking opportunity beats writing speculative content. Build the briefs from keyword data, not guesses.",
      category: "content",
      priority: "medium",
      estimatedMinutes: 180,
      toolPath: `/content/c/${input.clientId}`,
    });
  }

  push(cal, {
    day: 12,
    date: addDays(start, 11),
    title: "Run cannibalization detector — fix conflicts on top pages",
    whyItMatters:
      "Two pages competing for the same query split clicks and confuse Google. Consolidate or differentiate.",
    category: "content",
    priority: "medium",
    estimatedMinutes: 30,
    toolPath: `/cannibalization/c/${input.clientId}`,
  });

  push(cal, {
    day: 13,
    date: addDays(start, 12),
    title: "Topic cluster review: identify 1 weak pillar + 3 supporting pages",
    whyItMatters:
      "Topical authority comes from clustered, internally-linked pages. Strengthening one weak cluster lifts the whole cluster.",
    category: "content",
    priority: "medium",
    estimatedMinutes: 45,
    toolPath: `/content/c/${input.clientId}`,
  });

  push(cal, {
    day: 14,
    date: addDays(start, 13),
    title: "Content decay scan + plan 2 refreshes for next week",
    whyItMatters:
      "Updating a page that already ranks costs less than writing a new one. Fix what already ranks first.",
    category: "content",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: `/content/c/${input.clientId}`,
  });

  // ============== Week 3: GBP + Local + AI visibility ==============
  // GBP is now a baseline: applies to ALL niches per product direction.
  if (input.hasGbp || input.niche === "local") {
    push(cal, {
      day: 15,
      date: addDays(start, 14),
      title: "GBP: reply to every unanswered review (positive + negative)",
      whyItMatters:
        "Replying to reviews shows an active listing, reassures future customers and counts for local ranking.",
      category: "gbp",
      priority: "high",
      estimatedMinutes: 30,
      toolPath: `/gbp/c/${input.clientId}`,
    });
  } else {
    push(cal, {
      day: 15,
      date: addDays(start, 14),
      title: "Set up Google Business Profile (yes, even for non-local)",
      whyItMatters:
        "Even non-local businesses get visibility from a basic GBP — branded queries, knowledge-panel rich results, and Maps presence for office/HQ.",
      category: "gbp",
      priority: "medium",
      estimatedMinutes: 30,
      toolPath: `/gbp/c/${input.clientId}`,
    });
  }

  push(cal, {
    day: 16,
    date: addDays(start, 15),
    title: "GBP: post 1 update + upload 3 fresh photos",
    whyItMatters:
      "Posts and photos show the business is active.",
    category: "gbp",
    priority: "medium",
    estimatedMinutes: 20,
    toolPath: `/gbp/c/${input.clientId}`,
  });

  push(cal, {
    day: 17,
    date: addDays(start, 16),
    title: input.niche === "local" && input.city
      ? fr
        ? `Annuaires : vérifier que nom, adresse et téléphone sont identiques partout (${input.city})`
        : `Citation audit: NAP consistency across top ${input.country} directories for ${input.city}`
      : "Brand mention audit: top 10 places your brand is discussed online",
    whyItMatters: input.niche === "local"
      ? fr
        ? "Des nom, adresse ou téléphone différents d’un annuaire à l’autre nuisent au classement local."
        : "NAP inconsistencies (different addresses/phones across directories) directly hurt local pack rankings."
      : "Tracking unlinked mentions surfaces easy link-building targets and brand monitoring opportunities.",
    category: "local",
    priority: "medium",
    estimatedMinutes: 45,
    toolPath: "/citations",
  });

  push(cal, {
    day: 18,
    date: addDays(start, 17),
    title: "AI visibility check: run brand queries through ChatGPT, Perplexity, Gemini",
    whyItMatters:
      "AI assistants answer more and more searches themselves. Check whether they cite the site at all.",
    category: "ai_visibility",
    priority: "medium",
    estimatedMinutes: 25,
    toolPath: "/ai-visibility",
  });

  push(cal, {
    day: 19,
    date: addDays(start, 18),
    title: "Optimize 1 page for AI Overview citation (chunked, factual, source-cited)",
    whyItMatters:
      "AI answers quote short, factual, sourced passages. Restructure one page that way.",
    category: "ai_visibility",
    priority: "medium",
    estimatedMinutes: 60,
    toolPath: `/content/c/${input.clientId}`,
  });

  push(cal, {
    day: 20,
    date: addDays(start, 19),
    title: "Run a CrUX check on your top 3 pages (real-user CWV)",
    whyItMatters:
      "Lighthouse is synthetic. CrUX is what real users experienced — and it's what Google's page-experience signal uses.",
    category: "technical",
    priority: "medium",
    estimatedMinutes: 20,
    toolPath: "/tools/crux",
  });

  push(cal, {
    day: 21,
    date: addDays(start, 20),
    title: "Weekly review + log wins/losses",
    whyItMatters:
      "Compounding wins requires noticing them. Spend 20 minutes reviewing the week, planning next.",
    category: "review",
    priority: "low",
    estimatedMinutes: 20,
    toolPath: `/clients/${input.clientId}`,
  });

  // ============== Week 4: Off-page + Reporting ==============
  push(cal, {
    day: 22,
    date: addDays(start, 21),
    title: "Find 10 link prospects via free DuckDuckGo prospecting",
    whyItMatters:
      "Ten well-chosen sites beat a hundred generic submissions.",
    category: "links",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: "/link-building/prospects",
  });

  push(cal, {
    day: 23,
    date: addDays(start, 22),
    title: "Send 5 personalised outreach emails using a template",
    whyItMatters:
      "A message written for the site contacted gets far more replies than one template sent to everyone.",
    category: "links",
    priority: "high",
    estimatedMinutes: 45,
    toolPath: `/outreach/c/${input.clientId}`,
  });

  push(cal, {
    day: 24,
    date: addDays(start, 23),
    title: "GBP: post a customer story or case study",
    whyItMatters:
      "A concrete example says more than a generic offer.",
    category: "gbp",
    priority: "low",
    estimatedMinutes: 20,
    toolPath: `/gbp/c/${input.clientId}`,
  });

  push(cal, {
    day: 25,
    date: addDays(start, 24),
    title: "Competitor SERP overlap: find 5 keywords you don't yet target",
    whyItMatters:
      "Gaps where competitors rank but you don't are the lowest-friction keyword opportunities — they've already validated demand.",
    category: "keywords",
    priority: "medium",
    estimatedMinutes: 35,
    toolPath: "/competitors",
  });

  push(cal, {
    day: 26,
    date: addDays(start, 25),
    title: "Schema audit + add Organization, FAQPage, BreadcrumbList where missing",
    whyItMatters:
      "Structured data makes pages eligible for Google's rich results, at no cost.",
    category: "technical",
    priority: "medium",
    estimatedMinutes: 40,
    toolPath: "/tools/schema",
  });

  push(cal, {
    day: 27,
    date: addDays(start, 26),
    title: "Image audit: compress + add WebP/AVIF on top 5 pages",
    whyItMatters:
      "Image weight is a frequent cause of a slow LCP.",
    category: "technical",
    priority: "medium",
    estimatedMinutes: 45,
    toolPath: "/image-audit",
  });

  push(cal, {
    day: 28,
    date: addDays(start, 27),
    title: "Re-run audit + diff against day-2 baseline",
    whyItMatters:
      "Quantifying progress in numbers (issues resolved, score change) is what makes the next plan easier to defend.",
    category: "review",
    priority: "high",
    estimatedMinutes: 25,
    toolPath: "/audits",
  });

  push(cal, {
    day: 29,
    date: addDays(start, 28),
    title: "Generate monthly client report + send",
    whyItMatters:
      "Reports earn renewals. The data is already in the tool — 25 minutes is enough to produce a polished, branded PDF.",
    category: "review",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: `/reports`,
  });

  push(cal, {
    day: 30,
    date: addDays(start, 29),
    title: "Plan next 30 days: re-generate calendar from current data",
    whyItMatters:
      "Each new month should reflect the latest audit + GSC reality, not last month's hypotheses.",
    category: "review",
    priority: "low",
    estimatedMinutes: 15,
    toolPath: `/clients/${input.clientId}/onboarding`,
  });

  return fr ? cal.map(localizeStep) : cal;
}

/** A fixed step in French; steps built from data are already French. */
function localizeStep(task: CalendarTask): CalendarTask {
  const t = CALENDAR_FR[task.title];
  return t ? { ...task, title: t[0], whyItMatters: t[1] } : task;
}

/**
 * The French title of an audit finding's fix. The finding messages are
 * the engine's English sentences; the rule name (engine) or the task
 * blueprint (crawler) has a French version. "Corriger : No author byline"
 * would be no better than the English.
 */
export function issueTitleFr(issue: TopIssue): string {
  const pages = issue.pages ?? 1;
  const where = pages > 1 ? `${pages} pages` : placeFr(issue.url ? [issue.url] : []);
  const type = issue.type ?? "";
  const rule = ruleNamesFr[type.replace(/^seomator:/, "")];
  if (type.startsWith("seomator:") && rule) {
    return pages > 1 ? `Corriger : ${rule} (${pages} pages)` : `Corriger : ${rule} (${where})`;
  }
  const blueprint = blueprintsFr[type];
  if (blueprint) return blueprint.title(where);
  const crawler = CRAWLER_FIX_FR[type];
  if (crawler) return crawler(where);
  return `Corriger : ${issue.title}`;
}

function push(arr: CalendarTask[], task: CalendarTask) {
  arr.push(task);
}
