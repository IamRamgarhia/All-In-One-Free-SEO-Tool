export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, asc, and } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import {
  ArrowUpRight,
  CalendarClock,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Sparkles,
} from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  audits,
  reportSchedules,
  tasks,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { getSmtpConfig } from "@/lib/mailer";
import { clientScope } from "@/lib/client-scope";
import { SummaryPreview } from "./summary-preview";

type Template =
  | "executive"
  | "detailed"
  | "technical"
  | "ceo"
  | "cmo"
  | "cto"
  | "junior";

type Accent = "violet" | "cyan" | "amber" | "emerald" | "rose";

type TemplateMeta = {
  id: Template;
  accent: Accent;
  bulletKeys: string[];
};

/** Template ids stay English (download filenames / query params). */
const TEMPLATES: TemplateMeta[] = [
  {
    id: "executive",
    accent: "violet",
    bulletKeys: ["0", "1", "2", "3"],
  },
  {
    id: "detailed",
    accent: "cyan",
    bulletKeys: ["0", "1", "2", "3", "4"],
  },
  {
    id: "technical",
    accent: "amber",
    bulletKeys: ["0", "1", "2", "3"],
  },
];

const STAKEHOLDER_VARIANTS: TemplateMeta[] = [
  { id: "ceo", accent: "emerald", bulletKeys: ["0", "1", "2", "3"] },
  { id: "cmo", accent: "violet", bulletKeys: ["0", "1", "2", "3"] },
  { id: "cto", accent: "amber", bulletKeys: ["0", "1", "2", "3"] },
  { id: "junior", accent: "rose", bulletKeys: ["0", "1", "2"] },
];

export default async function PerClientReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const [latest] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId));
  const doneTasks = allTasks.filter((t) => t.status === "done").length;

  const schedules = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.clientId, clientId))
    .orderBy(desc(reportSchedules.updatedAt));

  const smtpConfigured = Boolean(await getSmtpConfig());
  const t = await getTranslations("reports");

  function resolveTemplate(meta: TemplateMeta) {
    return {
      id: meta.id,
      accent: meta.accent,
      name: t(`templates.${meta.id}.name`),
      description: t(`templates.${meta.id}.description`),
      bullets: meta.bulletKeys.map((k) =>
        t(`templates.${meta.id}.bullets.${k}`),
      ),
    };
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/reports/c"
        toolLabel={t("toolLabel")}
        icon={FileText}
      />

      <PageHeader
        title={t("clientTitle", { name: client.name })}
        description={t("clientDescription")}
        icon={FileText}
        accent="cyan"
      />

      {/* Quick stats strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t("latestHealthScore")}
          value={latest?.score !== undefined && latest?.score !== null ? `${latest.score}/100` : "—"}
          tone={
            latest?.score == null
              ? "neutral"
              : latest.score >= 80
                ? "emerald"
                : latest.score >= 50
                  ? "amber"
                  : "rose"
          }
          hint={
            latest
              ? t("auditedOn", {
                  date: (latest.completedAt ?? latest.createdAt).toLocaleDateString(),
                })
              : t("runAuditFirst")
          }
        />
        <Stat
          label={t("tasksCompleted")}
          value={`${doneTasks}/${allTasks.length}`}
          tone="violet"
          hint={t("tasksCompletedHint")}
        />
        <Stat
          label={t("issuesInLatest")}
          value={latest ? String(latest.issuesCount) : "—"}
          tone={
            latest && latest.issuesCount === 0
              ? "emerald"
              : latest && latest.issuesCount > 20
                ? "rose"
                : "amber"
          }
          hint={latest ? t("fromTheReport") : "—"}
        />
      </div>

      <SummaryPreview clientId={client.id} />

      {/* Template download cards */}
      <section className="grid gap-4 lg:grid-cols-3">
        {TEMPLATES.map((meta) => (
          <TemplateCard
            key={meta.id}
            template={resolveTemplate(meta)}
            clientId={client.id}
            ready={Boolean(latest)}
            downloadLabel={t("downloadPdf")}
            auditFirstHint={t("auditFirstHint")}
          />
        ))}
      </section>

      {/* Stakeholder variants — same data, framed for a specific reader */}
      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold">{t("stakeholderTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("stakeholderDescription")}
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAKEHOLDER_VARIANTS.map((meta) => (
            <TemplateCard
              key={meta.id}
              template={resolveTemplate(meta)}
              clientId={client.id}
              ready={Boolean(latest)}
              downloadLabel={t("downloadPdf")}
              auditFirstHint={t("auditFirstHint")}
            />
          ))}
        </div>
      </section>

      {/* Quarterly strategy doc — strategic, not operational */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <FileText className="size-4 text-violet-300" />
          {t("quarterlyTitle")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("quarterlyDescription")}
        </p>
        <div className="mt-4">
          <a
            href={`/reports/${client.id}/quarterly`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
          >
            <Download className="size-3.5" />
            {t("downloadQuarterly")}
          </a>
        </div>
      </section>

      {/* Schedule + email */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="size-4 text-cyan-300" />
            {t("emailDelivery")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {smtpConfigured ? t("smtpConfigured") : t("smtpMissing")}
          </p>
        </header>
        <div className="space-y-3 p-5">
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noSchedules")}
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {schedules.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {s.template} ·{" "}
                      <span className="font-normal text-muted-foreground">
                        {s.frequency === "monthly"
                          ? t("monthlyOnDay", { day: s.dayOfMonth ?? "—" })
                          : t("weekly")}{" "}
                        {t("atHour", { hour: s.hourOfDay ?? "—" })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("recipients", {
                        count: s.recipients.length,
                        list: s.recipients.join(", "),
                      })}
                    </div>
                    {s.nextSendAt && (
                      <div className="text-[11px] text-muted-foreground/80">
                        {t("nextSend", { when: s.nextSendAt.toLocaleString() })}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/clients/${client.id}#schedule`}
                    className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
                  >
                    {t("manage")}
                    <ArrowUpRight className="size-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              href={`/clients/${client.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              <Mail className="size-3.5" />
              {schedules.length > 0 ? t("editSchedule") : t("setUpSchedule")}
              <ExternalLink className="size-3" />
            </Link>
            {!smtpConfigured && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20"
              >
                <Sparkles className="size-3.5" />
                {t("configureSmtp")}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* CSV / raw exports */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="size-4 text-emerald-300" />
            {t("rawExports")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("rawExportsHint")}
          </p>
        </header>
        <ul className="divide-y divide-white/[0.04]">
          <ExportRow
            label={t("keywordsExport")}
            description={t("keywordsExportHint")}
            href={`/keywords/export.csv?clientId=${client.id}`}
          />
        </ul>
      </section>
    </div>
  );
}

function TemplateCard({
  template,
  clientId,
  ready,
  downloadLabel,
  auditFirstHint,
}: {
  template: {
    id: Template;
    accent: Accent;
    name: string;
    description: string;
    bullets: string[];
  };
  clientId: number;
  ready: boolean;
  downloadLabel: string;
  auditFirstHint: string;
}) {
  const accentText = (
    {
      violet: "text-gradient-violet",
      cyan: "text-gradient-cyan",
      amber: "text-gradient-amber",
      emerald: "text-emerald-300",
      rose: "text-rose-300",
    } as const
  )[template.accent];

  return (
    <div className="glass-apple lift-on-hover relative overflow-hidden rounded-2xl p-5">
      <div className={`text-xl font-semibold tracking-tight ${accentText}`}>
        {template.name}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {template.description}
      </p>
      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        {template.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-violet-300" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <a
          href={`/reports/${clientId}?template=${template.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-violet-500/25 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90"
          download={`${template.id}-report.pdf`}
        >
          <Download className="size-3.5" />
          {downloadLabel}
        </a>
        {!ready && (
          <p className="text-[11px] text-amber-300">
            {auditFirstHint}
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "violet" | "cyan" | "amber" | "emerald" | "rose" | "neutral";
  hint?: string;
}) {
  const cls = {
    violet: "text-gradient-violet",
    cyan: "text-gradient-cyan",
    amber: "text-gradient-amber",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

function ExportRow({
  label,
  description,
  href,
}: {
  label: string;
  description: string;
  href: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <a
        href={href}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
      >
        <Download className="size-3" />
        CSV
      </a>
    </li>
  );
}
