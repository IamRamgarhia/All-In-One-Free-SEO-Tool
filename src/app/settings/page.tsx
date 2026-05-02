export const dynamic = "force-dynamic";

import path from "node:path";
import { count } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Database,
  Key,
  Mail,
  Moon,
  Palette,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
} from "lucide-react";
import { SmtpForm } from "./smtp-form";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { db } from "@/db/client";
import { audits, clients, keywords, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { getSetting } from "@/lib/settings-store";
import {
  configuredProviders,
  getActiveProvider,
  getOllamaUrl,
} from "@/lib/api-keys";
import { WebhookForm } from "./webhook-form";
import { BrandForm } from "./brand-form";
import { ApiKeysSection } from "./api-keys-section";
import { ActiveProviderCard } from "./active-provider-card";

export default async function SettingsPage() {
  const [{ value: clientCount }] = await db
    .select({ value: count() })
    .from(clients);
  const [{ value: auditCount }] = await db
    .select({ value: count() })
    .from(audits);
  const [{ value: taskCount }] = await db
    .select({ value: count() })
    .from(tasks);
  const [{ value: keywordCount }] = await db
    .select({ value: count() })
    .from(keywords);

  const dbPath =
    process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");

  const webhookUrl = await getSetting<string>("webhook.url");
  const brandName = await getSetting<string>("brand.name");
  const brandColor = await getSetting<string>("brand.color");
  const brandLogo = await getSetting<string>("brand.logo_data_url");
  const { byId: configuredKeys } = await configuredProviders();
  const ollamaUrl = await getOllamaUrl();
  const activeProvider = await getActiveProvider();
  const googleStatus = await getGoogleConnectionStatus();

  // SMTP config — read individually so we can pass an "initial" object to the
  // form without leaking the password value
  const smtpHost = await getSetting<string>("smtp.host");
  const smtpPort = await getSetting<string>("smtp.port");
  const smtpUser = await getSetting<string>("smtp.user");
  const smtpFromEmail = await getSetting<string>("smtp.from_email");
  const smtpFromName = await getSetting<string>("smtp.from_name");
  const smtpSecure = await getSetting<string>("smtp.secure");
  const smtpHasPassword = Boolean(await getSetting<string>("smtp.password"));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace preferences, integrations, and where your data lives."
        icon={SettingsIcon}
        accent="violet"
      />

      {/* Workspace */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-violet-300" />
            Workspace
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Single-user mode — everything runs on this machine.
          </p>
        </header>
        <div className="relative grid gap-4 p-5 sm:grid-cols-2">
          <SettingRow label="Mode" value="Local · single-user" />
          <SettingRow label="Theme" value="Dark (default)" icon={Moon} />
          <SettingRow label="Language" value="English" />
          <SettingRow label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
        </div>
      </section>

      {/* Data */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Database className="size-4 text-cyan-300" />
            Data
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your database is one file you can copy, back up, or move.
          </p>
        </header>
        <div className="relative space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Counter label="Clients" value={clientCount} accent="violet" />
            <Counter label="Audits" value={auditCount} accent="cyan" />
            <Counter label="Tasks" value={taskCount} accent="amber" />
            <Counter label="Keywords" value={keywordCount} accent="emerald" />
          </div>
          <div className="rounded-xl border border-white/5 bg-black/20 p-4 font-mono text-xs">
            <div className="text-muted-foreground">Database file</div>
            <div className="mt-1 break-all text-foreground/90">{dbPath}</div>
          </div>
        </div>
      </section>

      {/* Brand */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Palette className="size-4 text-fuchsia-300" />
            Brand
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used on PDF reports — your logo on the cover, your color for
            headings and accents. Hides our branding entirely.
          </p>
        </header>
        <div className="relative p-5">
          <BrandForm
            initialName={brandName}
            initialColor={brandColor}
            initialLogoDataUrl={brandLogo}
          />
        </div>
      </section>

      {/* Google integration */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plug className="size-4 text-violet-300" />
            Google integration
            {googleStatus.configured ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <CheckCircle2 className="size-3" />
                Connected
              </span>
            ) : (
              <span className="ml-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                Not connected
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Connect once, use across every client. Unlocks real keyword data,
            traffic charts, and quick-wins finder. Free, ~5 minutes to set up.
          </p>
        </header>
        <div className="relative flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="space-y-0.5 text-sm">
            {googleStatus.configured ? (
              <>
                <div className="font-medium">
                  {googleStatus.email ?? "Connected"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Pulling Search Console + Analytics data when you wire
                  properties on each client.
                </div>
              </>
            ) : googleStatus.credentialsSet ? (
              <>
                <div className="font-medium">Credentials saved</div>
                <div className="text-xs text-muted-foreground">
                  One step left — connect your Google account.
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                Step-by-step guide on the next page. Skippable — the rest of
                the app works without it.
              </div>
            )}
          </div>
          <Link
            href="/settings/google"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10"
          >
            {googleStatus.configured ? "Manage" : "Set up"}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* Email / SMTP — for scheduled report delivery */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Mail className="size-4 text-cyan-300" />
            Email delivery
            {smtpHost ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <CheckCircle2 className="size-3" />
                Configured
              </span>
            ) : (
              <span className="ml-1 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                Not configured
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            SMTP credentials for sending scheduled monthly reports straight to
            clients. Bring your own — Gmail, Resend, SendGrid, or any SMTP host.
          </p>
        </header>
        <div className="relative p-5">
          <SmtpForm
            initial={{
              host: smtpHost,
              port: smtpPort,
              user: smtpUser,
              fromEmail: smtpFromEmail,
              fromName: smtpFromName,
              secure: smtpSecure,
              hasPassword: smtpHasPassword,
            }}
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bell className="size-4 text-fuchsia-300" />
            Notifications
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Get pinged in Slack, Discord, or Teams when audits complete and
            scores change. We auto-format the message for whichever service you
            use.
          </p>
        </header>
        <div className="relative p-5">
          <WebhookForm initialUrl={webhookUrl} />
          <div className="mt-5 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="font-medium text-foreground">When triggered</div>
              <div className="mt-1">
                Audit completed, score dropped &ge;5 points, or audit failed.
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="font-medium text-foreground">What we send</div>
              <div className="mt-1">
                Client name, score with delta, top issue, link back to the
                audit.
              </div>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="font-medium text-foreground">Where it goes</div>
              <div className="mt-1">
                Only the URL you paste. Nothing else, ever.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-amber-500/15 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Key className="size-4 text-amber-300" />
            AI provider keys
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Free options first. Most features work without any keys — these
            unlock the AI executive summaries, AI assistant, OCR extraction,
            and AI visibility tracking.
          </p>
        </header>
        <div className="relative space-y-5 p-5">
          <ActiveProviderCard
            active={activeProvider}
            configured={configuredKeys}
          />
          <ApiKeysSection
            configured={configuredKeys}
            ollamaUrl={ollamaUrl}
          />
        </div>
      </section>

      {/* Privacy */}
      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <header className="relative border-b border-emerald-500/20 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-emerald-300">
            <Shield className="size-4" />
            Privacy
          </h2>
        </header>
        <div className="relative space-y-2 p-5 text-sm text-foreground/80">
          <PrivacyLine>
            <strong>No telemetry.</strong> This app does not phone home or send
            usage data anywhere.
          </PrivacyLine>
          <PrivacyLine>
            <strong>Your data stays here.</strong> Clients, audits, tasks,
            keywords — all in <code className="text-xs">data.db</code> on this
            machine.
          </PrivacyLine>
          <PrivacyLine>
            <strong>Outbound requests are explicit.</strong> Tech detection,
            audits, and keyword research fetch the URLs you tell us to. Nothing
            else.
          </PrivacyLine>
        </div>
      </section>
    </div>
  );
}

function SettingRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Moon;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 font-medium">
        {Icon && <Icon className="size-4 text-violet-300" />}
        {value}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "violet" | "cyan" | "amber" | "emerald";
}) {
  const tone = {
    violet: "text-gradient-violet",
    cyan: "text-gradient-cyan",
    amber: "text-gradient-amber",
    emerald: "text-gradient-emerald",
  }[accent];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>
        {value}
      </div>
    </div>
  );
}

function PrivacyLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-400" />
      <span>{children}</span>
    </div>
  );
}
