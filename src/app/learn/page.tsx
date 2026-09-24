import {
  GraduationCap,
  BookOpen,
  Lightbulb,
  ShieldAlert,
  CheckCircle2,
  Link2,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

const linkBuildingPlays = [
  {
    name: "Digital PR / data studies",
    summary:
      "Publish original research or surveys with surprising findings. Pitch journalists who cover the topic. The most reliable way to earn .gov / .edu / news-tier links in 2026.",
    effort: "high",
    payoff: "high",
  },
  {
    name: "Broken link building",
    summary:
      "Find broken pages on competitor / niche sites that linked to a topic you cover. Email the webmaster with a working replacement URL. Conversion rates 5-15%.",
    effort: "medium",
    payoff: "medium",
  },
  {
    name: "Resource-page outreach",
    summary:
      "Search for `inurl:resources` + your niche. If your content is a better fit than what they list, ask. Best for genuinely useful tools / guides.",
    effort: "medium",
    payoff: "medium",
  },
  {
    name: "HARO / Qwoted / Help A B2B Writer",
    summary:
      "Reply to journalist queries with quotable expertise. Earned media that lands in Forbes, Inc., trade pubs. Daily 15-min habit.",
    effort: "low",
    payoff: "high",
  },
  {
    name: "Niche edits (link insertions)",
    summary:
      "Find existing relevant articles on authoritative sites and pitch a section update where your link adds value. Doesn't require new content from them.",
    effort: "medium",
    payoff: "medium",
  },
  {
    name: "Guest posting (selectively)",
    summary:
      "Only on sites with real readers and editorial standards. PBN-style guest posting is a 2010s tactic — Google's spam updates devalue it.",
    effort: "high",
    payoff: "low",
  },
  {
    name: "Reclaim unlinked mentions",
    summary:
      "Set up Google Alerts / monitoring for your brand. When someone mentions you without linking, ask. ~30% conversion if the mention is positive.",
    effort: "low",
    payoff: "medium",
  },
  {
    name: "Build linkable assets",
    summary:
      "Free tools, calculators, definitive guides, statistics roundups. People link because the asset itself solves their problem — passive earned links over years.",
    effort: "high",
    payoff: "very high",
  },
  {
    name: "Internal linking audit (compounds)",
    summary:
      "Not external link-building, but doubles the impact of every backlink you earn. Send authority from your strongest pages to weaker ones every month.",
    effort: "low",
    payoff: "high",
  },
];

const linkRulesOf2026 = [
  "Disavow file is mostly obsolete — Google's spam team handles bad links automatically. Only disavow after a manual penalty.",
  "PBN networks are detectable and devalued. Stop wasting budget on private link networks.",
  "Reciprocal links (you link to me, I link to you) at small scale are fine. At large scale they're a footprint.",
  "Anchor text diversity matters more than keyword anchor density. Aim for 70% branded / generic, 30% keyword-rich.",
  "DR / DA are correlation metrics, not causation. A genuine link from a relevant DR-30 site can outperform a paid DR-70 link.",
  "Sponsored content + nofollow / sponsored rel attribute is fine. Hidden paid placement is risky.",
];

const glossary = [
  {
    term: "Title tag",
    short: "The clickable headline of your search result.",
    why: "It's the strongest on-page signal Google has about what a page is about. Aim for 50–60 characters with the primary keyword near the start.",
  },
  {
    term: "Meta description",
    short: "The summary text shown under the title in search results.",
    why: "Not a direct ranking factor, but it heavily influences click-through rate. 120–155 characters with a clear value proposition.",
  },
  {
    term: "Canonical tag",
    short: "A signal to Google about the main version of this page when similar pages exist.",
    why: "Without a canonical, Google guesses which URL is the 'real' one and may split your ranking signals across duplicates.",
  },
  {
    term: "Core Web Vitals",
    short: "Google's three metrics for page experience: LCP, INP, CLS.",
    why: "LCP under 2.5s, INP under 200ms, CLS under 0.1. Failing these hurts both rankings and conversions on commercial pages.",
  },
  {
    term: "E-E-A-T",
    short: "Experience, Expertise, Authoritativeness, Trustworthiness.",
    why: "What Google's quality raters look for in content. Real authors with real credentials beat anonymous AI-generated content, especially for YMYL topics.",
  },
  {
    term: "Schema markup (JSON-LD)",
    short: "Structured data that tells Google what your page is about in machine-readable form.",
    why: "Unlocks rich results — review stars, FAQ accordions, product info, breadcrumbs — directly improving CTR and visibility.",
  },
  {
    term: "Striking-distance keyword",
    short: "A keyword you currently rank in positions 4–15 for.",
    why: "These are the highest-ROI keywords to optimize. Small improvements move you onto page 1 or into the top 3, where almost all clicks happen.",
  },
  {
    term: "Content decay",
    short: "When a previously-ranking page loses traffic over time.",
    why: "Refreshing decaying content recovers traffic at a fraction of the cost of new posts. It's the highest-ROI content task most people neglect.",
  },
  {
    term: "Topic cluster",
    short: "A pillar page covering a broad topic, surrounded by supporting articles linked back to it.",
    why: "Demonstrates topical authority — covering a subject deeply — which is one of Google's strongest content-quality signals after the helpful-content updates.",
  },
  {
    term: "Backlink",
    short: "A link from another site to yours.",
    why: "Still one of the top ranking factors. Quality matters far more than quantity — one link from a relevant, authoritative site beats fifty low-quality links.",
  },
];

const folklore = [
  {
    title: "Keyword density should be 2–3%",
    truth: "Google has explicitly said keyword density isn't a ranking factor. Write naturally and let semantic relevance speak for itself.",
  },
  {
    title: "Meta keywords tag matters",
    truth: "Google has not used meta keywords as a ranking signal in over a decade. It's pure folklore — leave them out.",
  },
  {
    title: "Submit your site to 100 directories",
    truth: "Spammy directory submissions can actively hurt rankings. Focus on a handful of relevant, niche-specific citations instead.",
  },
  {
    title: "Use only one H1 per page",
    truth: "HTML5 allows multiple H1s, and Google handles them fine. What matters is a clear heading hierarchy, not the count.",
  },
  {
    title: "Exact-match keywords in URLs are critical",
    truth: "Helpful but heavily overemphasized. Short, descriptive, human-readable URLs beat keyword-stuffed ones.",
  },
];

const goldenRules = [
  "Write for humans first, search engines second — Google is increasingly good at rewarding genuine helpfulness.",
  "Earn links by deserving them. Build something link-worthy, then promote it. Don't buy or trade links.",
  "Speed is a feature, not a luxury. A slow site loses both rankings and conversions, especially on mobile.",
  "Consistency beats intensity. Five quality posts a year on one topic beats 50 scattered posts.",
  "Mobile-first is non-negotiable. Google indexes the mobile version of your site. If it's broken on phones, you don't rank.",
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Learn"
        description="Plain-language SEO basics. Every recommendation in this tool is grounded in what Google has actually confirmed — not folklore."
        icon={GraduationCap}
        accent="emerald"
        noHelp
      />

      {/* Golden rules */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle2 className="size-4 text-emerald-300" />
            Five rules that hold up in 2026
          </h2>
        </header>
        <ul className="relative divide-y divide-white/5">
          {goldenRules.map((rule, i) => (
            <li key={i} className="flex gap-4 px-5 py-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/30">
                {i + 1}
              </span>
              <p className="text-sm text-foreground/90">{rule}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Glossary */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BookOpen className="size-4 text-cyan-300" />
            Glossary
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every term explained in plain language — with the &lsquo;why it
            matters&rsquo; that most glossaries skip.
          </p>
        </header>
        <ul className="relative divide-y divide-white/5">
          {glossary.map((g) => (
            <li key={g.term} className="px-5 py-4">
              <div className="flex items-baseline gap-3">
                <h3 className="text-sm font-semibold">{g.term}</h3>
                <span className="text-xs text-muted-foreground">
                  {g.short}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  Why it matters:
                </span>{" "}
                {g.why}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Link building guide */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Link2 className="size-4 text-violet-300" />
            Link building in 2026
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What still works, ranked by realistic effort vs payoff. None of
            this is buy-50-PBN-links cheap. Real links require real value.
          </p>
        </header>

        <div className="relative px-5 py-4">
          <div className="mb-4 rounded-xl bg-rose-500/[0.05] p-3 ring-1 ring-inset ring-rose-500/20">
            <div className="text-xs font-semibold text-rose-300">
              Hard rules of 2026
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {linkRulesOf2026.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>

          <ul className="relative space-y-2">
            {linkBuildingPlays.map((p) => (
              <li
                key={p.name}
                className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.04]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">
                      effort: {p.effort}
                    </span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                      payoff: {p.payoff}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {p.summary}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SEO folklore */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-rose-500/15 blur-3xl" />
        <header className="relative border-b border-rose-500/20 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-rose-300">
            <ShieldAlert className="size-4" />
            SEO folklore — myths to ignore
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Common bad advice you&apos;ll see in older blog posts and on Reddit.
            Save yourself the wasted effort.
          </p>
        </header>
        <ul className="relative divide-y divide-rose-500/10">
          {folklore.map((f) => (
            <li key={f.title} className="px-5 py-4">
              <div className="text-sm font-medium text-rose-200/80 line-through decoration-rose-400/60">
                {f.title}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/80">
                <Lightbulb className="mr-1 inline size-3 text-amber-300" />
                {f.truth}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
