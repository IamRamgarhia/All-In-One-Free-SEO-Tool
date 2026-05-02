import {
  GraduationCap,
  BookOpen,
  Lightbulb,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

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
