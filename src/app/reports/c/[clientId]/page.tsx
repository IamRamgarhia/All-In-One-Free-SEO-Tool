export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, asc, and } from "drizzle-orm";
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

type Template = "executive" | "detailed" | "technical";

const TEMPLATES: {
  id: Template;
  name: string;
  description: string;
  bullets: string[];
  accent: "violet" | "cyan" | "amber";
}[] = [
  {
    id: "executive",
    name: "Executive",
    description: "1-page summary for stakeholders.",
    bullets: [
      "AI-written executive summary",
      "Health score + delta vs prior",
      "Top 5 organic keywords",
      "Top issues by severity",
    ],
    accent: "violet",
  },
  {
    id: "detailed",
    name: "Detailed (recommended)",
    description: "Full monthly report — what most clients want.",
    bullets: [
      "Everything in Executive +",
      "Real organic traffic chart (GA4)",
      "Top 10 keywords with CTR + position",
      "Quick-win opportunities",
      "Tasks completed + recommendations",
    ],
    accent: "cyan",
  },
  {
    id: "technical",
    name: "Technical",
    description: "Engineering hand-off — every issue with affected URLs.",
    bullets: [
      "Every audit issue across all crawled pages",
      "Affected URLs per issue",
      "Tech stack detail",
      "Use for pre / post-deploy verification",
    ],
    accent: "amber",
  },
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
        toolLabel="Reports"
        icon={FileText}
      />

      <PageHeader
        title={`Reports · ${client.name}`}
        description="Pick a template and download. Reports include real Search Console + GA4 numbers when Google is connected, and your agency branding when configured."
        icon={FileText}
        accent="cyan"
      />

      {/* Quick stats strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Latest health score"
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
              ? `Audited ${(latest.completedAt ?? latest.createdAt).toLocaleDateString()}`
              : "Run an audit first"
          }
        />
        <Stat
          label="Tasks completed"
          value={`${doneTasks}/${allTasks.length}`}
          tone="violet"
          hint="All time on this client"
        />
        <Stat
          label="Issues in latest audit"
          value={latest ? String(latest.issuesCount) : "—"}
          tone={
            latest && latest.issuesCount === 0
              ? "emerald"
              : latest && latest.issuesCount > 20
                ? "rose"
                : "amber"
          }
          hint={latest ? "From the report" : "—"}
        />
      </div>

      {/* Template download cards */}
      <section className="grid gap-4 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            clientId={client.id}
            ready={Boolean(latest)}
          />
        ))}
      </section>

      {/* Schedule + email */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="size-4 text-cyan-300" />
            Email delivery
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {smtpConfigured
              ? "SMTP configured. You can schedule auto-delivery on the client detail page."
              : "Set up SMTP in Settings → Email delivery to schedule reports or send on demand."}
          </p>
        </header>
        <div className="space-y-3 p-5">
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No scheduled reports yet for this client.
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
                          ? `monthly on day ${s.dayOfMonth}`
                          : "weekly"}{" "}
                        at {s.hourOfDay}:00
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.recipients.length} recipient
                      {s.recipients.length === 1 ? "" : "s"}:{" "}
                      {s.recipients.join(", ")}
                    </div>
                    {s.nextSendAt && (
                      <div className="text-[11px] text-muted-foreground/80">
                        Next send: {s.nextSendAt.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/clients/${client.id}#schedule`}
                    className="inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
                  >
                    Manage
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
              {schedules.length > 0 ? "Edit schedule" : "Set up schedule"}
              <ExternalLink className="size-3" />
            </Link>
            {!smtpConfigured && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20"
              >
                <Sparkles className="size-3.5" />
                Configure SMTP
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
            Raw data exports
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Skip the PDF — pull the underlying data as CSV instead.
          </p>
        </header>
        <ul className="divide-y divide-white/[0.04]">
          <ExportRow
            label="Tracked keywords + ranks"
            description="Every keyword tracked for this client with its full rank history."
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
}: {
  template: (typeof TEMPLATES)[number];
  clientId: number;
  ready: boolean;
}) {
  const accentText = {
    violet: "text-gradient-violet",
    cyan: "text-gradient-cyan",
    amber: "text-gradient-amber",
  }[template.accent];

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
          Download PDF
        </a>
        {!ready && (
          <p className="text-[11px] text-amber-300">
            Run an audit first for the most useful report.
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
