export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Sparkles,
  XCircle,
} from "lucide-react";
import { headers } from "next/headers";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { getSetting } from "@/lib/settings-store";
import { GoogleCredentialsForm } from "./credentials-form";
import {
  clearGoogleCredentials,
  disconnectGoogleAccount,
} from "./actions";

type SearchParams = Promise<{ connected?: string; error?: string }>;

export default async function GoogleSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = await getGoogleConnectionStatus();
  const clientId = await getSetting<string>("google.client_id");
  const clientSecret = await getSetting<string>("google.client_secret");

  // Best-effort guess of the redirect URI for the user — we can't know the
  // browser-side URL from a server component, but the host header gets us close.
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const redirectUri = `${proto}://${host}/api/google/callback`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/settings"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to settings
        </Link>
        <PageHeader
          title="Google integration"
          description="Connect Google Search Console + Analytics 4 once. Then per client, just pick the property from a dropdown. Free, no quotas you'll hit."
          icon={Sparkles}
          accent="violet"
        />
      </div>

      {/* Status banner */}
      {params.connected === "1" && (
        <Banner tone="success" icon={CheckCircle2}>
          Connected. {status.email && <strong>{status.email}</strong>} can now
          read GSC + GA4 data. Pick a property on each client to start pulling
          real numbers.
        </Banner>
      )}
      {params.error && (
        <Banner tone="error" icon={AlertCircle}>
          Connection failed: <code className="font-mono">{params.error}</code>
        </Banner>
      )}

      {/* Env-var mode notice */}
      {status.credentialsFromEnv && (
        <Banner tone="success" icon={CheckCircle2}>
          <strong>One-click sign-in active.</strong> OAuth credentials are set
          via env vars (<code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code>{" "}
          + <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code>). All
          users on this instance just click <em>Sign in with Google</em> — no
          Google Cloud Console steps needed. The setup guide below is only for
          users who haven&apos;t set the env vars.
        </Banner>
      )}
      {!status.credentialsFromEnv && (
        <Banner tone="info" icon={CheckCircle2}>
          <strong>Want zero-config sign-in for everyone?</strong> Set these
          env vars and restart the app — the setup guide below disappears and
          users just hit <em>Sign in with Google</em>:
          <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-black/40 p-2 text-[11px] leading-relaxed text-foreground/90">{`GOOGLE_OAUTH_CLIENT_ID=…apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-…`}</pre>
          You still create the Google Cloud OAuth client once — but every user
          of this instance benefits from it without doing the setup themselves.
        </Banner>
      )}

      {/* Why */}
      <Section title="Why connect Google?">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <Bullet>
            <strong className="text-foreground">Real keyword rankings</strong>{" "}
            from Google itself — not scraped, not estimated.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Quick wins finder</strong> —
            keywords sitting at positions 4-15, one tweak away from page 1.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Content decay detector</strong>{" "}
            — pages losing traffic, ranked by recovery value.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Real monthly reports</strong> —
            actual traffic charts in PDFs instead of placeholder data.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Page-level health</strong> —
            indexability + CTR per URL straight from GSC.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Free, forever</strong> — 25,000
            GSC queries/day + 50,000 GA4 tokens/day. You won&apos;t hit them.
          </Bullet>
        </ul>
      </Section>

      {/* Step-by-step setup — only meaningful when not in env-var mode */}
      <Section
        title={
          status.credentialsFromEnv
            ? "Step-by-step setup (skipped — env vars active)"
            : "Step-by-step setup (~5 minutes)"
        }
      >
        <ol className="space-y-5">
          <Step
            n={1}
            title="Create a Google Cloud project"
            done={Boolean(clientId)}
          >
            <p>
              Open the{" "}
              <ExternalLinkA href="https://console.cloud.google.com/projectcreate">
                Google Cloud Console
              </ExternalLinkA>{" "}
              and create a project (any name — &ldquo;SEO Tool&rdquo; works).
              Free, no credit card.
            </p>
          </Step>

          <Step n={2} title="Enable two APIs" done={Boolean(clientId)}>
            <p className="mb-2">In your project, enable these (click each, hit &ldquo;Enable&rdquo;):</p>
            <ul className="space-y-1 pl-2">
              <li>
                ·{" "}
                <ExternalLinkA href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">
                  Search Console API
                </ExternalLinkA>
              </li>
              <li>
                ·{" "}
                <ExternalLinkA href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com">
                  Google Analytics Data API
                </ExternalLinkA>
              </li>
              <li>
                ·{" "}
                <ExternalLinkA href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com">
                  Google Analytics Admin API
                </ExternalLinkA>{" "}
                <span className="text-muted-foreground/70">
                  (so we can list your GA4 properties)
                </span>
              </li>
            </ul>
          </Step>

          <Step
            n={3}
            title="Configure the OAuth consent screen"
            done={Boolean(clientId)}
          >
            <p className="mb-2">
              In{" "}
              <ExternalLinkA href="https://console.cloud.google.com/apis/credentials/consent">
                APIs & Services → OAuth consent screen
              </ExternalLinkA>
              :
            </p>
            <ul className="space-y-1 pl-2">
              <li>· User Type: <strong>External</strong></li>
              <li>· App name: anything (e.g. &ldquo;My SEO Tool&rdquo;)</li>
              <li>· User support email: yourself</li>
              <li>
                · Add yourself under <strong>Test users</strong> (you can have up to
                100 testers without verification — plenty for personal use)
              </li>
            </ul>
          </Step>

          <Step
            n={4}
            title="Create an OAuth Client ID"
            done={Boolean(clientId)}
          >
            <p className="mb-2">
              Go to{" "}
              <ExternalLinkA href="https://console.cloud.google.com/apis/credentials">
                APIs & Services → Credentials
              </ExternalLinkA>
              , click <strong>Create Credentials → OAuth client ID</strong>:
            </p>
            <ul className="space-y-1 pl-2">
              <li>· Application type: <strong>Web application</strong></li>
              <li>· Name: anything</li>
              <li>
                · Under <strong>Authorized redirect URIs</strong>, paste this
                exact URL:
              </li>
            </ul>
            <RedirectUriBox uri={redirectUri} />
            <p className="mt-2 text-xs text-muted-foreground/80">
              When you click &ldquo;Create&rdquo;, Google shows you a Client ID
              and Client Secret. Copy both — you&apos;ll paste them in step 5.
            </p>
          </Step>

          <Step
            n={5}
            title="Paste your Client ID + Secret here"
            done={status.credentialsSet}
          >
            <GoogleCredentialsForm
              initialClientId={clientId}
              hasSecret={Boolean(clientSecret)}
            />
            {status.credentialsSet && (
              <form action={clearGoogleCredentials} className="mt-3">
                <Button type="submit" variant="ghost" size="sm">
                  Clear credentials
                </Button>
              </form>
            )}
          </Step>

          <Step
            n={6}
            title="Connect your Google account"
            done={status.connected}
          >
            {!status.credentialsSet ? (
              <p className="text-muted-foreground">
                Save your Client ID + Secret in step 5 first.
              </p>
            ) : status.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  <CheckCircle2 className="size-4" />
                  Connected
                  {status.email && (
                    <>
                      {" as "}
                      <strong>{status.email}</strong>
                    </>
                  )}
                </div>
                <form action={disconnectGoogleAccount}>
                  <Button type="submit" variant="ghost" size="sm">
                    <XCircle className="size-3.5" />
                    Disconnect
                  </Button>
                </form>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Click below to log in with Google and grant read access to
                  Search Console + Analytics. You&apos;ll see an &ldquo;app
                  isn&apos;t verified&rdquo; warning — that&apos;s expected for
                  apps in test mode. Click <strong>Advanced → Go to [your
                  project]</strong>.
                </p>
                <Link
                  href="/api/google/auth"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90"
                >
                  <Sparkles className="size-4" />
                  Connect Google
                </Link>
              </div>
            )}
          </Step>

          <Step
            n={7}
            title="Pick properties per client"
            done={false}
          >
            <p className="text-muted-foreground">
              On each client&apos;s detail page, you&apos;ll see dropdowns to
              pick the matching GSC property + GA4 property. Skippable — you
              can connect later.
            </p>
          </Step>
        </ol>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="relative border-b border-white/5 px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      <div className="relative space-y-4 p-5">{children}</div>
    </section>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-inset ${
          done
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
            : "bg-white/5 text-muted-foreground ring-white/10"
        }`}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-300" />
      <span>{children}</span>
    </li>
  );
}

function ExternalLinkA({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-violet-300 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

function RedirectUriBox({ uri }: { uri: string }) {
  return (
    <div className="my-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
      <span className="flex-1 truncate text-foreground">{uri}</span>
      <CopyButton text={uri} />
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  // Server component — render plain anchor with the snippet for users to
  // select. Real one-click copy needs a client component; keeping it minimal
  // here to avoid a dedicated file.
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
      title="Triple-click to select, Ctrl/Cmd+C to copy"
    >
      <Copy className="size-3" />
      {text.length > 0 ? "select" : ""}
    </span>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
}: {
  tone: "success" | "error" | "info";
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-violet-500/30 bg-violet-500/10 text-violet-100";
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${toneCls}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1 leading-relaxed">{children}</div>
    </div>
  );
}
