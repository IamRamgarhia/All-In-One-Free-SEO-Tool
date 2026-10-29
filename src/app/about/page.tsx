import {
  ArrowRight,
  Bot,
  Bug,
  Code2,
  Globe,
  Info,
  Rocket,
  Scale,
  Share2,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { MaintainerCredit } from "@/components/shell/maintainer-credit";
import { SupportersTracker } from "@/components/support/supporters-tracker";
import { MAINTAINER } from "@/lib/maintainer";
import { REPO_NEW_ISSUE_URL } from "@/lib/repo";
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

      {/* License — plain-English summary of the MIT license.
          This section described the project's old noncommercial license
          for months after the move to MIT in June 2026: it told people
          they could not sell or host the software, which MIT expressly
          allows. A license is the one piece of text in an app that must
          never be out of date, so `license-claims.test.ts` reads LICENSE
          and fails the build if this page disagrees with it. */}
      <section
        id="license"
        className="scroll-mt-20 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3 text-sm"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Scale className="size-4 text-emerald-300" />
          License — MIT, so yours to do almost anything with
        </h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          This tool is published under the{" "}
          <a
            href="https://opensource.org/license/mit"
            target="_blank"
            rel="noreferrer noopener"
            className="text-emerald-300 hover:underline"
          >
            MIT license
          </a>
          , which is about as permissive as licenses get. It started life
          under a noncommercial license and moved to MIT in June 2026,
          because being easy to find and easy to adopt mattered more than
          keeping anyone from reselling it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-emerald-500/[0.05] p-3 ring-1 ring-inset ring-emerald-500/20">
            <p className="mb-1.5 text-xs font-semibold text-emerald-300">
              You can — no permission needed
            </p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>• Self-host for your own SEO work, at any volume</li>
              <li>• Use it for client work as a freelancer or agency</li>
              <li>• Modify, fork and adapt the code</li>
              <li>• Sell it, or run it as a paid hosted service</li>
              <li>• Rebrand it and strip the credit below</li>
            </ul>
          </div>
          <div className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-inset ring-white/10">
            <p className="mb-1.5 text-xs font-semibold">
              All MIT asks in return
            </p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>
                • Keep the copyright and license text in copies of the
                source
              </li>
              <li>
                • Accept that it comes with no warranty — if it breaks
                your client&apos;s site, that is on you
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">
              That is the whole license. There is nothing to buy and
              nobody to email for a commercial one.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          The maintainer credit and the support card are asked for, not
          required: nothing in MIT obliges you to keep either, and the
          code to remove them is not hidden. Leaving the credit in place
          helps other SEOs find the project, which is the only reason to.
          Questions, or want something built?{" "}
          <a
            href={`mailto:${MAINTAINER.contactEmail}`}
            className="text-emerald-300 hover:underline"
          >
            {MAINTAINER.contactEmail}
          </a>
          .
        </p>
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

        <p className="text-[10px] text-muted-foreground">
          Note: this is separate from the SEO tool&apos;s license. If
          you want to <strong>resell or paid-host this SEO tool</strong>,
          that&apos;s a different (also welcome) conversation —{" "}
          see <a href="#license" className="text-violet-300 hover:underline">License</a> above.
        </p>
      </section>
    </div>
  );
}
