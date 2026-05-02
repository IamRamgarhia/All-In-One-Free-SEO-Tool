"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveGoogleCredentials,
  disconnectGoogleAccount,
  type SaveCredentialsResult,
} from "@/app/settings/google/actions";

type Status = {
  configured: boolean;
  connected: boolean;
  credentialsSet: boolean;
  credentialsFromEnv: boolean;
  email: string | null;
};

export function GoogleSetupDialog({
  open,
  onClose,
  initialStatus,
  redirectUri,
  initialClientId,
  hasSecret,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  initialStatus: Status;
  redirectUri: string;
  initialClientId: string | null;
  hasSecret: boolean;
  onConnected?: (email: string | null) => void;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);

  function deriveStep(
    s: Status,
  ): "intro" | "creds" | "connect" | "done" {
    if (s.configured) return "done";
    // Env-var credentials skip the manual setup entirely — single button.
    if (s.credentialsFromEnv) return "connect";
    if (s.credentialsSet) return "connect";
    return "intro";
  }

  const [step, setStep] = useState<"intro" | "creds" | "connect" | "done">(
    deriveStep(initialStatus),
  );

  const [oauthError, setOauthError] = useState<string | null>(null);
  const [popup, setPopup] = useState<Window | null>(null);

  // Sync incoming status when dialog re-opens — defer setState to avoid
  // cascading-render lint warnings.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setStatus(initialStatus);
      setStep(deriveStep(initialStatus));
    }, 0);
    return () => clearTimeout(t);
  }, [open, initialStatus]);

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    if (!open) return;
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      if (typeof data.ok !== "boolean") return;
      if (data.ok) {
        const email = (data.email as string | null) ?? null;
        setStatus((s) => ({ ...s, connected: true, configured: true, email }));
        setStep("done");
        onConnected?.(email);
      } else {
        setOauthError(data.error ?? "Unknown error");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, onConnected]);

  function startOAuth() {
    setOauthError(null);
    const w = window.open(
      "/api/google/auth?popup=1",
      "google-oauth",
      "width=520,height=720,popup=true",
    );
    setPopup(w);
  }

  // Poll the popup so we can detect "user closed it" without success
  useEffect(() => {
    if (!popup) return;
    const t = setInterval(() => {
      if (popup.closed) {
        clearInterval(t);
        setPopup(null);
      }
    }, 500);
    return () => clearInterval(t);
  }, [popup]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        status.credentialsFromEnv && step !== "done"
          ? "Sign in with Google"
          : "Connect Google"
      }
      description={
        status.credentialsFromEnv && step !== "done"
          ? "One click. Read-only access to Search Console + Analytics. Skippable — the rest of the app works without it."
          : "One-time setup. Same connection serves every client. Skippable — the rest of the app works without it."
      }
    >
      {step === "intro" && (
        <IntroStep onNext={() => setStep("creds")} />
      )}

      {step === "creds" && (
        <CredentialsStep
          initialClientId={initialClientId}
          hasSecret={hasSecret}
          redirectUri={redirectUri}
          onSaved={() => {
            setStatus((s) => ({ ...s, credentialsSet: true }));
            setStep("connect");
          }}
          onBack={() => setStep("intro")}
        />
      )}

      {step === "connect" && (
        <ConnectStep
          oauthError={oauthError}
          onConnect={startOAuth}
          onBack={
            status.credentialsFromEnv ? null : () => setStep("creds")
          }
          waiting={Boolean(popup)}
          hideVerificationWarning={status.credentialsFromEnv}
        />
      )}

      {step === "done" && (
        <DoneStep
          email={status.email}
          onDisconnect={async () => {
            await disconnectGoogleAccount();
            setStatus((s) => ({
              ...s,
              connected: false,
              configured: false,
              email: null,
            }));
            setStep("connect");
          }}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function IntroStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Bullet>
          <strong className="text-foreground">Real keyword positions</strong>{" "}
          from Google itself — not scraped.
        </Bullet>
        <Bullet>
          <strong className="text-foreground">Quick-wins finder</strong> —
          keywords at positions 4-15.
        </Bullet>
        <Bullet>
          <strong className="text-foreground">Real organic traffic</strong> in
          PDF reports.
        </Bullet>
        <Bullet>
          <strong className="text-foreground">Free forever</strong> — 25k GSC
          + 50k GA4 queries/day.
        </Bullet>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="font-medium">How it works</p>
        <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>
            <strong>1.</strong> One-time: create an OAuth app in Google Cloud
            (~3 min, free). You&apos;ll paste a Client ID + Secret here.
          </li>
          <li>
            <strong>2.</strong> One-time: log in with the Google account that
            has access to your GSC properties.
          </li>
          <li>
            <strong>3.</strong> Per client: pick the GSC property + GA4
            property from a dropdown.
          </li>
        </ol>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onNext}>
          Start setup
          <ExternalLink className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CredentialsStep({
  initialClientId,
  hasSecret,
  redirectUri,
  onSaved,
  onBack,
}: {
  initialClientId: string | null;
  hasSecret: boolean;
  redirectUri: string;
  onSaved: () => void;
  onBack: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  function copyRedirect() {
    navigator.clipboard.writeText(redirectUri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result: SaveCredentialsResult = await saveGoogleCredentials(
        null,
        fd,
      );
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors({});
      onSaved();
    });
  }

  return (
    <div className="space-y-5">
      {/* Quick-link strip — open Google Cloud in new tab */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="mb-2 font-medium">Steps in Google Cloud Console</p>
        <ol className="space-y-1.5 text-xs text-muted-foreground">
          <li>
            <strong>1.</strong>{" "}
            <ExtA href="https://console.cloud.google.com/projectcreate">
              Create a project
            </ExtA>{" "}
            (any name)
          </li>
          <li>
            <strong>2.</strong> Enable APIs:{" "}
            <ExtA href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com">
              Search Console
            </ExtA>{" "}
            ·{" "}
            <ExtA href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com">
              Analytics Data
            </ExtA>{" "}
            ·{" "}
            <ExtA href="https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com">
              Analytics Admin
            </ExtA>
          </li>
          <li>
            <strong>3.</strong>{" "}
            <ExtA href="https://console.cloud.google.com/apis/credentials/consent">
              Configure OAuth consent screen
            </ExtA>{" "}
            (External, add yourself as Test User)
          </li>
          <li>
            <strong>4.</strong>{" "}
            <ExtA href="https://console.cloud.google.com/apis/credentials">
              Create OAuth Client ID
            </ExtA>{" "}
            (Web application). Paste this redirect URI:
          </li>
        </ol>

        <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate text-foreground">{redirectUri}</span>
          <button
            type="button"
            onClick={copyRedirect}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <Copy className="size-3" />
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="dlg-clientId">Client ID</Label>
          <Input
            id="dlg-clientId"
            name="clientId"
            placeholder="123-abc.apps.googleusercontent.com"
            defaultValue={initialClientId ?? ""}
            aria-invalid={Boolean(errors.clientId)}
          />
          {errors.clientId && (
            <p className="text-xs text-destructive">{errors.clientId}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dlg-clientSecret">Client Secret</Label>
          <Input
            id="dlg-clientSecret"
            name="clientSecret"
            type="password"
            placeholder={hasSecret ? "•••••••••••••••• (saved)" : "GOCSPX-…"}
            aria-invalid={Boolean(errors.clientSecret)}
          />
          {errors.clientSecret && (
            <p className="text-xs text-destructive">{errors.clientSecret}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save credentials"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConnectStep({
  oauthError,
  onConnect,
  onBack,
  waiting,
  hideVerificationWarning,
}: {
  oauthError: string | null;
  onConnect: () => void;
  onBack: (() => void) | null;
  waiting: boolean;
  hideVerificationWarning: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {hideVerificationWarning ? (
          <>
            Click below. A new window opens for Google to ask which account
            you want to use and to grant <strong>read-only</strong> access to
            Search Console + Analytics.
          </>
        ) : (
          <>
            Click <strong>Connect Google</strong>. A new window opens for you
            to sign in. Pick the Google account that has access to your Search
            Console + Analytics properties. Grant read access — done.
          </>
        )}
      </p>

      {!hideVerificationWarning && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <strong>Heads up:</strong> Google shows a &ldquo;this app
          isn&apos;t verified&rdquo; warning while your project is in test
          mode. Click <strong>Advanced → Go to [your project]</strong>. This
          is normal for personal/local apps.
        </div>
      )}

      {oauthError && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{oauthError}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onConnect} disabled={waiting}>
          {waiting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Waiting for Google…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Sign in with Google
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  email,
  onDisconnect,
  onClose,
}: {
  email: string | null;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">Connected</div>
          {email && (
            <div className="text-xs text-emerald-300/80">{email}</div>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Now go to any client&apos;s detail page and pick the matching{" "}
        <strong>Search Console property</strong> and{" "}
        <strong>GA4 property</strong> from the dropdowns. The same Google
        login covers every client — you just pick the right property each
        time.
      </p>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDisconnect}>
          <XCircle className="size-3.5" />
          Disconnect
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-300" />
      <span>{children}</span>
    </div>
  );
}

function ExtA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-violet-300 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}
