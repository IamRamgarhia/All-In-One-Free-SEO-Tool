import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Code2,
  Globe,
  Heart,
  Info,
  Keyboard,
  Rocket,
  Scale,
  Sparkles,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { MaintainerCredit } from "@/components/shell/maintainer-credit";
import { MAINTAINER } from "@/lib/maintainer";
import { getTranslations } from "next-intl/server";

// Not force-static: rendered without the session cookie, the root
// layout's sign-in guard found no user and sent everyone to /login.

export default async function AboutPage() {
  const t = await getTranslations("ui.app_about_page");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={Info}
        accent="violet"
      />

      <MaintainerCredit variant="block" />

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-cyan-300" />
          {t("whatTitle")}
        </h2>
        <p className="text-muted-foreground">
          {t("whatBody")}
        </p>
        <ul className="space-y-1.5 text-xs">
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">{t("freeFirstTitle")}</strong>{" "}
              {t("freeFirstBody")}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">{t("privacyTitle")}</strong>{" "}
              {t("privacyBody")}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">{t("stackTitle")}</strong>{" "}
              {t("stackBody")}
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-foreground">{t("oneKeyTitle")}</strong>{" "}
              {t("oneKeyBody")}
            </span>
          </li>
        </ul>
      </section>

      {/* Developer / website strip */}
      <section className="grid gap-3 sm:grid-cols-3">
        {MAINTAINER.website && (
          <a
            href={MAINTAINER.website}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-card/40 p-4 transition-colors hover:bg-card/60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30">
              <Globe className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold group-hover:text-violet-200">
                dicecodes.com
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {t("websiteDesc")}
              </div>
            </div>
          </a>
        )}
        {MAINTAINER.github && (
          <a
            href={MAINTAINER.github}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-card/40 p-4 transition-colors hover:bg-card/60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-foreground/80 ring-1 ring-inset ring-white/10">
              <Code2 className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold group-hover:text-violet-200">
                {t("sourceTitle")}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {t("sourceDesc")}
              </div>
            </div>
          </a>
        )}
        <Link
          href="/shortcuts"
          className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-card/40 p-4 transition-colors hover:bg-card/60"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
            <Keyboard className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold group-hover:text-cyan-200">
              {t("shortcutsTitle")}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {t.rich("shortcutsDesc", {
                kbd: (chunks) => <kbd className="rounded bg-white/5 px-1">{chunks}</kbd>,
              })}
            </div>
          </div>
        </Link>
      </section>

      {/* License — plain-English summary of PolyForm Noncommercial 1.0.0 */}
      <section
        id="license"
        className="scroll-mt-20 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5 space-y-3 text-sm"
      >
        <h2 className="flex items-center gap-2 font-semibold">
          <Scale className="size-4 text-amber-300" />
          {t("licenseTitle")}
        </h2>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t.rich("licenseIntro", {
            link: (chunks) => (
              <a
                href="https://polyformproject.org/licenses/noncommercial/1.0.0/"
                target="_blank"
                rel="noreferrer noopener"
                className="text-amber-300 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-emerald-500/[0.05] p-3 ring-1 ring-inset ring-emerald-500/20">
            <p className="mb-1.5 text-xs font-semibold text-emerald-300">
              {t("canTitle")}
            </p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>• {t("can1")}</li>
              <li>• {t("can2")}</li>
              <li>• {t("can3")}</li>
              <li>• {t("can4")}</li>
              <li>• {t("can5")}</li>
            </ul>
          </div>
          <div className="rounded-lg bg-rose-500/[0.05] p-3 ring-1 ring-inset ring-rose-500/20">
            <p className="mb-1.5 text-xs font-semibold text-rose-300">
              {t("cannotTitle")}
            </p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              <li>• {t("cannot1")}</li>
              <li>• {t("cannot2")}</li>
              <li>• {t("cannot3")}</li>
              <li>• {t("cannot4")}</li>
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t.rich("commercial", {
            email: MAINTAINER.contactEmail,
            link: (chunks) => (
              <a
                href={`mailto:${MAINTAINER.contactEmail}`}
                className="text-amber-300 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>

      <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 text-xs text-rose-200">
        <Heart className="mr-1 inline size-3.5" />
        {t.rich("tip", { b: (chunks) => <strong>{chunks}</strong> })}
      </p>

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
              {t("hireTitle")}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {t("hireSubtitle", { name: MAINTAINER.name })}
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("hireBody")}
        </p>

        <ul className="grid gap-1.5 text-[11px] text-foreground/85 sm:grid-cols-2">
          <li className="flex items-start gap-1.5">
            <Rocket className="mt-0.5 size-3 shrink-0 text-violet-300" />
            <span>{t.rich("hire1", { b: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Bot className="mt-0.5 size-3 shrink-0 text-cyan-300" />
            <span>{t.rich("hire2", { b: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Wrench className="mt-0.5 size-3 shrink-0 text-emerald-300" />
            <span>{t.rich("hire3", { b: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
          <li className="flex items-start gap-1.5">
            <Code2 className="mt-0.5 size-3 shrink-0 text-amber-300" />
            <span>{t.rich("hire4", { b: (chunks) => <strong>{chunks}</strong> })}</span>
          </li>
        </ul>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={`mailto:${MAINTAINER.contactEmail}?subject=Custom%20software%20enquiry`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-500/20 px-3 text-xs font-semibold text-violet-100 ring-1 ring-inset ring-violet-400/40 transition-colors hover:bg-violet-500/30"
          >
            {t("emailCta", { email: MAINTAINER.contactEmail })}
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
              {t("pastWork")}
            </a>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          {t.rich("hireNote", {
            b: (chunks) => <strong>{chunks}</strong>,
            link: (chunks) => (
              <a href="#license" className="text-violet-300 hover:underline">
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
    </div>
  );
}
