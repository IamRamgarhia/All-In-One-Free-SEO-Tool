import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Wrench,
  Search,
  Lightbulb,
  AlertTriangle,
  Database,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export const dynamic = "force-dynamic";

const CAN_DO = [
  {
    icon: Database,
    title: "Read your own data",
    examples: [
      "Which client has the worst health score?",
      "What's the most common issue across all my audits?",
      "Show me striking-distance keywords (positions 4-15).",
      "Which pages on Client X lost traffic last 28 days?",
      "What did the daily agent do this morning?",
    ],
  },
  {
    icon: Wrench,
    title: "Write code on request",
    examples: [
      "Write a WordPress plugin that adds canonical tags to all posts.",
      "Generate JSON-LD schema for a local dentist (5 services, hours).",
      "Give me .htaccess to redirect /old-blog/* to /blog/*.",
      "Write a Shopify Liquid snippet for product schema with reviews.",
    ],
    note: "For complex code, the SEO code generator tool gives a cleaner UI + install steps.",
    noteLink: { label: "Use the code generator", href: "/tools/code-generator" },
  },
  {
    icon: Search,
    title: "Research live data",
    examples: [
      "What is Google AI Overview, and how do I get cited in it?",
      "Latest Google algorithm updates this month.",
      "Top 10 trending topics in [your niche] this week.",
      "Who's the top competitor for keyword X?",
    ],
    note: "Live research uses an external search when 'Research' mode is enabled.",
  },
  {
    icon: Lightbulb,
    title: "Strategic advice",
    examples: [
      "What should I focus on first for Client X?",
      "How do I rank a brand-new site for [keyword]?",
      "Is it worth pursuing AI Overview citations for this query?",
      "What's the best link-building strategy for a SaaS in [niche]?",
    ],
  },
  {
    icon: MessageCircle,
    title: "Skill-mode focus",
    examples: [
      "Switch to Local SEO skill → tailored advice for Google Business Profile, citations, reviews.",
      "Switch to Technical SEO skill → core web vitals, schema, indexing edge cases.",
      "Switch to AI Visibility → LLM citation tactics, llms.txt, AI bot policy.",
      "26 skills total covering every SEO specialty.",
    ],
    note: "Skills change the system prompt so answers stay narrow and actionable.",
  },
];

const CANT_DO = [
  {
    title: "Submit forms on third-party sites",
    why: "Most directories require human verification (phone, email, document). I can write the message + tell you exactly where to paste, but you click Submit.",
    workaround:
      "Use the Backlink prospects library — every entry has step-by-step submission instructions.",
    workaroundHref: "/link-building/library",
  },
  {
    title: "Modify someone else's site",
    why: "I can write code, but I can't push changes to a site you don't own. For your own WP site with our Bridge plugin installed, the audit tools can apply fixes directly.",
    workaround:
      "Install the WordPress Bridge plugin to enable one-click apply for title/meta/schema fixes.",
  },
  {
    title: "Verify Google Business Profile",
    why: "Google requires postcard / phone / video / document verification — there's no API to bypass it.",
    workaround:
      "Use the GBP toolkit page — checklist + reminder for every verification step.",
    workaroundHref: "/gbp",
  },
  {
    title: "Run rank checks at scale (1000s/day)",
    why: "Free browser-mode rank checking hits Google's rate limits.",
    workaround:
      "Spread checks across days, or BYO SERP API key (Serper, DataForSEO).",
  },
  {
    title: "Guarantee a ranking outcome",
    why: "Ranking depends on Google's quality system + competition + time. Anyone promising specific rankings is lying.",
    workaround:
      "I'll tell you what to prioritize + the realistic timeframe. Patience + consistency wins.",
  },
];

const TIPS = [
  "Be specific. 'Improve my SEO' is too vague; 'Get my pricing page from #18 to top-10 for [keyword]' is actionable.",
  "Reference real data: 'The /pricing page lost 40% traffic on Mar 12 — what happened?'",
  "Use skill mode for narrow questions: technical issues → Technical SEO skill, link building → Off-page skill.",
  "When you want code, say 'write the code' explicitly — otherwise I'll explain rather than generate.",
  "If an answer feels generic, follow up with 'For my client X specifically' — I'll look at their data.",
];

export default function ChatCapabilitiesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/seo-chat"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to SEO chat
      </Link>

      <PageHeader
        title="What the AI chat can do"
        description="A complete reference of what the SEO chat can answer — and what it can't. Plus tips to get faster, better answers."
        icon={Bot}
        accent="violet"
      />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold text-emerald-300 inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4" />
            Things it can do
          </h2>
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {CAN_DO.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={i} className="px-5 py-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-violet-300" />
                  <p className="text-sm font-medium">{c.title}</p>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {c.examples.map((e, j) => (
                    <li key={j} className="flex items-start gap-1.5">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
                      <span>&quot;{e}&quot;</span>
                    </li>
                  ))}
                </ul>
                {c.note && (
                  <p className="rounded-md bg-violet-500/5 p-2 text-[11px] text-violet-300 ring-1 ring-inset ring-violet-500/20">
                    {c.note}
                    {c.noteLink && (
                      <>
                        {" — "}
                        <Link
                          href={c.noteLink.href}
                          className="underline hover:text-violet-100"
                        >
                          {c.noteLink.label}
                        </Link>
                      </>
                    )}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold text-rose-300 inline-flex items-center gap-1.5">
            <XCircle className="size-4" />
            Things it can&apos;t do (with workarounds)
          </h2>
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {CANT_DO.map((c, i) => (
            <li key={i} className="px-5 py-4 space-y-2 text-xs">
              <p className="text-sm font-medium">{c.title}</p>
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-400" />
                <span>{c.why}</span>
              </div>
              <div className="rounded-md bg-emerald-500/5 p-2 ring-1 ring-inset ring-emerald-500/20">
                <p className="text-[10px] uppercase tracking-wider text-emerald-300">
                  Workaround
                </p>
                <p className="text-muted-foreground">
                  {c.workaround}
                  {c.workaroundHref && (
                    <>
                      {" "}
                      <Link
                        href={c.workaroundHref}
                        className="text-emerald-300 underline hover:text-emerald-100"
                      >
                        Open →
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="text-sm font-semibold mb-3">
          Tips for getting better answers
        </h2>
        <ul className="space-y-2 text-sm">
          {TIPS.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-violet-400" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-xs text-muted-foreground">
        <p>
          The chat uses your configured AI provider (set in{" "}
          <Link href="/settings" className="text-violet-300 hover:underline">
            Settings → AI
          </Link>
          ). Local Ollama keeps everything private; Anthropic / OpenAI /
          Groq / Gemini are faster but send your prompt to their API.
          Provider choice is yours.
        </p>
      </section>
    </div>
  );
}
