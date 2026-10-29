import {
  ArrowRight,
  Bot,
  Bug,
  Code2,
  Globe,
  IndianRupee,
  Info,
  Rocket,
  Share2,
  Sparkles,
  Star,
  Wallet,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { MaintainerCredit } from "@/components/shell/maintainer-credit";
import { SupportersTracker } from "@/components/support/supporters-tracker";
import { UpiPanel } from "@/components/support/upi-panel";
import { MAINTAINER } from "@/lib/maintainer";
import { REPO_NEW_ISSUE_URL, REPO_URL } from "@/lib/repo";
import { getSupportTracker } from "@/lib/supporters-data";

/**
 * Rendered per request, not statically. The supporters tracker is fetched
 * from GitHub and cached in the settings table, and the whole point of
 * keeping those figures in a file outside the release is that editing it
 * updates every install — a statically rendered page would freeze whatever
 * the numbers were on build day and never move again.
 */
export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const { tracker, source } = await getSupportTracker();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Support & about"
        description="Who built it, what it stands for, and how to help."
        icon={Info}
        accent="violet"
      />

      {/* Two columns from `lg` up. This was a single 3xl column, which on
          any desktop screen left two thirds of the viewport empty and made
          the page roughly twice as tall as it needed to be. `items-start`
          so the two cards keep their own heights instead of stretching the
          shorter one. */}
      <div
        id="support"
        className="scroll-mt-20 grid items-start gap-5 lg:grid-cols-2"
      >
        <MaintainerCredit variant="block" />

        <SupportersTracker tracker={tracker} source={source} />

        {/* The QR, on the page rather than behind a button.
            It used to live only inside the support dialog, so someone who
            came here to pay found a page about paying with nothing to
            scan — they had to guess that a button two cards up opened it.
            Same component the dialog renders, so the two cannot drift. */}
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <IndianRupee className="size-3.5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Pay by UPI</h2>
              <p className="text-[11px] text-muted-foreground">
                Zero fees · instant · scan or tap. Any amount, any time —
                there is no subscription and nothing is withheld without one.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:items-start">
            <UpiPanel embedded />

            {MAINTAINER.paypal && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-md bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-500/30">
                    <Wallet className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Outside India?</h3>
                    <p className="text-[10px] text-muted-foreground">
                      Cards, PayPal balance or bank.
                    </p>
                  </div>
                </div>
                <a
                  href={MAINTAINER.paypal}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-sky-500/15 px-3 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25"
                >
                  Donate via PayPal →
                </a>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Whatever comes in goes on the goal above. Nothing here is
                  a licence fee — the software is yours either way.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Free ways first, deliberately. Most people reading this cannot
            spare money and can spare thirty seconds, and a page that leads
            with the payment ask reads as a paywall nagging. */}
        <section className="space-y-1 rounded-2xl border border-white/[0.06] bg-card/40 p-5 text-sm lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <Star className="size-4 text-amber-300" />
            Help without paying
          </h2>
          <p className="pb-1 text-xs text-muted-foreground">
            These matter just as much, and two of them take a few seconds.
          </p>
          {/* Three across only from `md`. At `sm` these are ~190px columns
              carrying two lines of text each, which reads worse than the
              stacked list it replaced. */}
          <div className="grid gap-x-6 md:grid-cols-3">
          {[
            {
              icon: Star,
              title: "Star it on GitHub",
              text: "The single biggest thing for helping other SEOs find it.",
              href: MAINTAINER.github,
            },
            {
              icon: Share2,
              title: "Tell another SEO",
              text: "A freelancer paying for Semrush out of pocket is who this is for.",
              href: `https://wa.me/?text=${encodeURIComponent(
                `I run my SEO work on this — it's free, self-hosted, and replaces most of what I was paying for: ${MAINTAINER.github}`,
              )}`,
            },
            {
              icon: Bug,
              title: "Report a bug or ask for a feature",
              text: "Plenty of what is in here started as somebody's issue.",
              href: REPO_NEW_ISSUE_URL,
            },
          ].map((w) => (
            <a
              key={w.title}
              href={w.href}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-3 border-t border-white/[0.06] py-2.5 transition-colors hover:text-foreground"
            >
              <w.icon className="mt-0.5 size-4 shrink-0 text-violet-300" />
              <span>
                <span className="block text-xs font-semibold">{w.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {w.text}
                </span>
              </span>
            </a>
          ))}
          </div>
        </section>
      </div>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-cyan-300" />
          What this is
        </h2>
        <p className="text-muted-foreground">
          A self-hosted SEO platform for freelancers, small agencies, and
          site owners. Audits, rank tracking, content, backlinks, local
          SEO, AI visibility and paid ads — all running on your own
          machine. No monthly fees, no surveillance, no paid APIs
          required to get started.
        </p>
        <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">Free-first.</strong>{" "}
              Uses Google&apos;s free APIs (GSC, GA4, PSI) + headless
              browser fallbacks. Paid keys are optional, BYO.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">Privacy-first.</strong>{" "}
              All data lives in a single SQLite file on your machine. No
              telemetry, no phone-home, no analytics.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">Tech-stack-aware.</strong>{" "}
              Recommendations adapt to WordPress / Shopify / Next.js /
              Webflow / etc. Detected automatically.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">One AI key.</strong>{" "}
              Plug in any free provider (Gemini / Groq / DeepSeek) once
              and every AI feature works — with workspace-wide
              concurrency limiting so automation never starves manual
              actions.
            </span>
          </li>
        </ul>
      </section>

      {/* Hire DiceCodes — services pitch. Distinct from the LICENSE
          commercial-license clause (which is for reselling THIS tool).
          This section is for "build NEW software FOR me". */}
      <section className="relative overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/[0.08] via-violet-500/[0.04] to-cyan-500/[0.06] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-400/40">
            <Rocket className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">
              Building something? We can ship it for you.
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {MAINTAINER.name} builds custom software — solo, end-to-end.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          This SEO platform — a daily AI agent, a headless browser pool,
          white-label reports — was built by one person.
          If you have an idea like this for your business or startup,
          we can build it.
        </p>

        <ul className="grid gap-1.5 text-[11px] text-foreground/85 sm:grid-cols-2">
          <li className="flex items-start gap-1.5">
            <Rocket className="mt-0.5 size-3 shrink-0 text-violet-300" />
            <span>
              <strong>Startup MVPs</strong> — idea → shipping product in
              4-12 weeks
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Bot className="mt-0.5 size-3 shrink-0 text-cyan-300" />
            <span>
              <strong>AI-powered apps</strong> — RAG, agents, automation
              workflows
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Wrench className="mt-0.5 size-3 shrink-0 text-emerald-300" />
            <span>
              <strong>Internal tools + dashboards</strong> for ops teams
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Code2 className="mt-0.5 size-3 shrink-0 text-amber-300" />
            <span>
              <strong>SaaS platforms</strong> with billing, auth,
              multi-tenancy
            </span>
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={`mailto:${MAINTAINER.contactEmail}?subject=Custom%20software%20enquiry`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-500/20 px-3 text-xs font-semibold text-violet-100 ring-1 ring-inset ring-violet-400/40 transition-colors hover:bg-violet-500/30"
          >
            Email {MAINTAINER.contactEmail}
            <ArrowRight className="size-3" />
          </a>
          {MAINTAINER.website && (
            <a
              href={MAINTAINER.website}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white/[0.04] px-3 text-xs font-medium text-foreground/85 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08]"
            >
              <Globe className="size-3" />
              See past work at dicecodes.com
            </a>
          )}
        </div>

        {/* This pointed at a License section on this page. That section is
            gone, so it points at the file instead — a dead #license anchor
            would have been the quiet kind of broken. */}
        <p className="text-[10px] text-muted-foreground">
          Note: this is about building something new for you. The SEO tool
          itself is{" "}
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-violet-300 hover:underline"
          >
            MIT-licensed
          </a>
          , so reselling or paid-hosting it needs no permission and costs
          nothing.
        </p>
      </section>
    </div>
  );
}
