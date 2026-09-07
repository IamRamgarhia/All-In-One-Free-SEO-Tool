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
  /** Highest-severity outstanding audit issues (titles only). */
  topIssues?: { title: string; severity: "critical" | "high" | "medium" | "low" }[];
  /** Niche-aware seed for content tasks. */
  contentSeeds?: string[];
  /** Optional start date — defaults to tomorrow. */
  startDate?: Date;
};

export function generateCalendar(input: CalendarInput): CalendarTask[] {
  const start = input.startDate ?? startOfDay(addDays(new Date(), 1));
  const cal: CalendarTask[] = [];

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
    title: "Run a full site audit + log critical issues",
    whyItMatters:
      "A baseline audit means every later improvement is measurable. Critical issues (broken indexability, mobile-fail, no sitemap) outweigh content work.",
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
        ? `Fix: ${issue.title}`
        : ["Audit + fix all broken meta titles", "Audit image alt-text gaps", "Check & resolve mobile-friendliness errors"][i],
      whyItMatters: issue
        ? `Severity ${issue.severity}. Open issues at this level cap how much downstream work can move rankings.`
        : "Quick technical wins compound — fixing these baseline issues makes every later content win 10-20% bigger.",
      category: "technical",
      priority: issue?.severity === "critical" ? "high" : "medium",
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
      "Fresh sitemaps drop indexing time to hours. IndexNow tells Bing/Yandex about new URLs the same day.",
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
      "Striking-distance keywords are the highest-ROI move in SEO. Push 5 of them onto page 1 = double the traffic for one weeks' work.",
    category: "keywords",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: input.hasGsc ? `/clients/${input.clientId}` : "/keywords",
  });

  // Days 9-11: write 3 quick-win-targeted briefs / refreshes
  const wins = input.quickWins ?? [];
  for (let i = 0; i < 3; i++) {
    const win = wins[i];
    push(cal, {
      day: 9 + i,
      date: addDays(start, 8 + i),
      title: win
        ? `Refresh page ranking for "${win.query}" (currently #${Math.round(win.position)})`
        : `Write content brief #${i + 1} for top quick-win keyword`,
      whyItMatters: win
        ? `${win.impressions.toLocaleString()} monthly impressions and you're already on page 2. Small intent / heading update can push it onto page 1.`
        : "Targeting a real ranking opportunity beats writing speculative content. Build briefs from data.",
      category: "content",
      priority: win ? "high" : "medium",
      estimatedMinutes: 60,
      toolPath: "https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio",
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
    toolPath: "https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio",
  });

  push(cal, {
    day: 14,
    date: addDays(start, 13),
    title: "Content decay scan + plan 2 refreshes for next week",
    whyItMatters:
      "Refreshing decaying pages is 3-5x more efficient than writing new ones. Fix what already ranks first.",
    category: "content",
    priority: "high",
    estimatedMinutes: 30,
    toolPath: "https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio",
  });

  // ============== Week 3: GBP + Local + AI visibility ==============
  // GBP is now a baseline: applies to ALL niches per product direction.
  if (input.hasGbp || input.niche === "local") {
    push(cal, {
      day: 15,
      date: addDays(start, 14),
      title: "GBP: reply to every unanswered review (positive + negative)",
      whyItMatters:
        "Reply rate is a direct GBP ranking signal — and every reply is a chance to bake keywords into your profile naturally.",
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
      "Posts and photos signal the listing is alive. Profiles updated weekly outrank dormant ones for the same keywords.",
    category: "gbp",
    priority: "medium",
    estimatedMinutes: 20,
    toolPath: `/gbp/c/${input.clientId}`,
  });

  push(cal, {
    day: 17,
    date: addDays(start, 16),
    title: input.niche === "local" && input.city
      ? `Citation audit: NAP consistency across top ${input.country} directories for ${input.city}`
      : "Brand mention audit: top 10 places your brand is discussed online",
    whyItMatters: input.niche === "local"
      ? "NAP inconsistencies (different addresses/phones across directories) directly hurt local pack rankings."
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
      "AI search results are now ~30% of commercial queries. If your brand isn't cited, customers never see it — even if you rank #1 in Google.",
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
      "AI Overviews favor chunked content with stats + sources. Restructuring 1 page can earn you a citation that drives more traffic than rank #1.",
    category: "ai_visibility",
    priority: "medium",
    estimatedMinutes: 60,
    toolPath: "https://github.com/IamRamgarhia/BlogPilot-Open-Source-AI-SEO-Content-Studio",
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
      "Outreach beats cold-email-blasts. 10 well-targeted resource pages > 100 generic submissions.",
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
      "Reply rate to truly personalised cold outreach is 8-15%. Generic templates: <2%. Three minutes per prospect makes the difference.",
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
      "Story-format posts get higher engagement than generic offers — a direct ranking signal in GBP.",
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
      "Rich-result eligibility shows in 30%+ of SERPs now. Missing schema = missing visibility you can add for free.",
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
      "Image weight is the #1 LCP killer. A 30% image reduction often moves CWV from FAIL → PASS.",
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

  return cal;
}

function push(arr: CalendarTask[], task: CalendarTask) {
  arr.push(task);
}
