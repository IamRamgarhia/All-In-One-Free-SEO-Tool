export const dynamic = "force-dynamic";

import path from "node:path";
import { count } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Brain,
  CheckCircle2,
  Globe,
  Database,
  Key,
  Mail,
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
import { CreditSaverForm } from "./credit-saver-form";
import { BrowserForm } from "./browser-form";
import { loadBrowserSettings } from "./browser-actions";
import { ApiKeyManager } from "./api-keys/manager";
import { db as dbClient } from "@/db/client";
import { apiKeys, inboundWebhooks } from "@/db/schema";
import { desc as descSql } from "drizzle-orm";
import { InboundWebhooksManager } from "./inbound-webhooks/manager";
import { UpdateCard } from "./update-card";

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
  const dbAbsolutePath = path.resolve(dbPath);

  const webhookUrl = await getSetting<string>("webhook.url");
  const brandName = await getSetting<string>("brand.name");
  const brandColor = await getSetting<string>("brand.color");
  const brandLogo = await getSetting<string>("brand.logo_data_url");
  const brandTagline = await getSetting<string>("brand.tagline");
  const brandWebsite = await getSetting<string>("brand.website");
  const brandEmail = await getSetting<string>("brand.email");
  const brandPhone = await getSetting<string>("brand.phone");
  const brandFooter = await getSetting<string>("brand.footer_text");
  const { byId: configuredKeys } = await configuredProviders();
  const ollamaUrl = await getOllamaUrl();
  const activeProvider = await getActiveProvider();
  const creditSaverOn = Boolean(
    await getSetting<boolean>("ai.credit_saver.enabled"),
  );
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
  const browserSettings = await loadBrowserSettings();

  const apiKeyRows = await dbClient
    .select()
    .from(apiKeys)
    .orderBy(descSql(apiKeys.createdAt))
    .limit(50);
  const inboundWebhookRows = await dbClient
    .select()
    .from(inboundWebhooks)
    .orderBy(descSql(inboundWebhooks.createdAt))
    .limit(50);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace preferences, integrations, and where your data lives."
        icon={SettingsIcon}
        accent="violet"
      />

      {/* Compact workspace strip + jump TOC. Replaces what used to be
          a full section with 4 read-only rows. Mode + timezone are the
          only bits worth surfacing; everything else is fixed today. */}
      <section className="rounded-xl border border-border bg-card/40 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Local · single-user
          </span>
          <span className="text-muted-foreground">{tz}</span>
          <span className="text-muted-foreground">Dark mode</span>
          <Link
            href="/shortcuts"
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Sparkles className="size-3" />
            Keyboard shortcuts
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </section>

      {/* Jump TOC — anchor links to each section below. Reorders the
          mental model around what users actually act on most often. */}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-1.5 text-xs"
      >
        {[
          { href: "#ai", label: "AI keys", primary: true },
          { href: "#google", label: "Google" },
          { href: "#email", label: "Email" },
          { href: "#brand", label: "Brand" },
          { href: "#notify", label: "Notifications" },
          { href: "#api", label: "API access" },
          { href: "#browser", label: "Browser pool" },
          { href: "#ai-learning", label: "AI learning" },
          { href: "#data", label: "Data" },
          { href: "#install", label: "Install" },
          { href: "#privacy", label: "Privacy" },
        ].map((t) => (
          <a
            key={t.href}
            href={t.href}
            className={`rounded-md px-2 py-1 ring-1 ring-inset transition-colors ${
              t.primary
                ? "bg-violet-500/15 text-violet-300 ring-violet-500/30 hover:bg-violet-500/25"
                : "bg-white/[0.02] text-muted-foreground ring-white/10 hover:bg-white/[0.05] hover:text-foreground"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      {/* Updates — keep at top but visually quieter */}
      <div id="install" className="scroll-mt-24">
        <UpdateCard />
      </div>

      {/* Data */}
      <section id="data" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
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
      <section id="brand" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
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
            initialTagline={brandTagline}
            initialWebsite={brandWebsite}
            initialEmail={brandEmail}
            initialPhone={brandPhone}
            initialFooterText={brandFooter}
          />
        </div>
      </section>

      {/* Google integration */}
      <section id="google" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
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
      <section id="email" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
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
      <section id="notify" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
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

      {/* Browser pool */}
      <section id="browser" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Globe className="size-4 text-cyan-300" />
            Headless browser pool
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Concurrency cap, stealth fingerprint, and optional outbound
            proxies for SERP scraping, rank checks, GBP scraping, render +
            screenshot, and local CWV measurement.
          </p>
        </header>
        <div className="relative p-5">
          <BrowserForm initial={browserSettings} />
        </div>
      </section>

      {/* Public API keys + inbound webhooks both gather under #api */}
      <section id="api" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Key className="size-4 text-violet-300" />
            Public API keys
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bearer-token auth for{" "}
            <code className="rounded bg-white/5 px-1 py-0.5">/api/v1/*</code>{" "}
            endpoints. Use these in n8n, Make, Zapier, your own scripts.
          </p>
        </header>
        <div className="relative p-5">
          <ApiKeyManager
            initial={apiKeyRows.map((k) => ({
              id: k.id,
              name: k.name,
              keyPrefix: k.keyPrefix,
              scopes: k.scopes,
              lastUsedAt: k.lastUsedAt,
              createdAt: k.createdAt,
              revokedAt: k.revokedAt,
            }))}
          />
        </div>
      </section>

      {/* Inbound webhooks */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Plug className="size-4 text-cyan-300" />
            Inbound webhooks
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Receive events from external systems — GitHub, Linear, Google
            Alerts, custom integrations. Each webhook gets a unique URL +
            stored event log you can replay or query.
          </p>
        </header>
        <div className="relative p-5">
          <InboundWebhooksManager initial={inboundWebhookRows} />
        </div>
      </section>

      {/* AI provider keys — primary entry point for most users.
          Kept a small amber glow because it's the highest-value section
          and the only one where the visual cue earns its weight. */}
      <section
        id="ai"
        className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-amber-500/20 bg-card/40 backdrop-blur-md"
      >
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-amber-500/10 blur-3xl" />
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
          <CreditSaverForm initial={creditSaverOn} />
          <ApiKeysSection
            configured={configuredKeys}
            ollamaUrl={ollamaUrl}
          />
        </div>
      </section>

      {/* AI learning */}
      <section id="ai-learning" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Brain className="size-4 text-violet-300" />
            AI learning
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Watches what you correct in AI output and turns it into
            durable style rules. The longer you use the tool, the better
            its first-pass output gets — no model training needed.
          </p>
        </header>
        <div className="relative flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            Review learned rules, manually disable any that are wrong,
            and trigger the distill step on demand.
          </p>
          <Link
            href="/settings/ai-learning"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/10"
          >
            Open AI learning
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="relative overflow-hidden scroll-mt-24 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 backdrop-blur-md">
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
            keywords — all in one SQLite file on this machine.
          </PrivacyLine>
          <div className="rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Database file
            </p>
            <code className="text-xs break-all">{dbAbsolutePath}</code>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Back this single file up to keep everything. Move it to a new
              machine to migrate. Replaceable via the{" "}
              <code>SEO_DB_PATH</code> env var.
            </p>
          </div>
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
