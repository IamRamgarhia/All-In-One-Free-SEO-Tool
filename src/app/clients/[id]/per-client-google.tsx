"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectPerClientGoogle } from "./per-client-google-actions";

export function PerClientGoogleConnect({
  clientId,
  connectedEmail,
  hasWorkspaceCreds,
}: {
  clientId: number;
  connectedEmail: string | null;
  hasWorkspaceCreds: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState(false);

  function startOAuth() {
    setOpening(true);
    const w = window.open(
      `/api/google/auth?clientId=${clientId}&popup=1`,
      "google-oauth",
      "width=500,height=700",
    );
    if (!w) {
      setOpening(false);
      return;
    }
    const checkClosed = setInterval(() => {
      if (w.closed) {
        clearInterval(checkClosed);
        setOpening(false);
        // Reload to pick up new tokens
        window.location.reload();
      }
    }, 500);
  }

  function disconnect() {
    if (!confirm("Disconnect this client's separate Google account?")) return;
    startTransition(async () => {
      await disconnectPerClientGoogle(clientId);
      window.location.reload();
    });
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] backdrop-blur-md">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
      <header className="relative border-b border-white/[0.06] px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Plug className="size-4 text-violet-300" />
          Per-client Google account
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          When the client&apos;s GSC / GA4 lives under their OWN Google account
          (not yours), connect that account here. We&apos;ll use these tokens
          for this client only — your workspace Google connection still works
          for everyone else.
        </p>
      </header>
      <div className="relative space-y-3 p-5">
        {!hasWorkspaceCreds ? (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
            Set up the workspace Google OAuth client first (Settings → Google).
            Per-client connections reuse those credentials.
          </div>
        ) : connectedEmail ? (
          <>
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">Connected</div>
                <div className="text-xs">{connectedEmail}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startOAuth}
                disabled={opening}
              >
                {opening ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Reconnecting…
                  </>
                ) : (
                  <>
                    <ExternalLink className="size-3" />
                    Reconnect
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={disconnect}
                disabled={pending}
                className="border-rose-500/20 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10"
              >
                <Trash2 className="size-3" />
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              onClick={startOAuth}
              disabled={opening}
              className="shadow-md shadow-violet-500/20"
            >
              {opening ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Opening Google…
                </>
              ) : (
                <>
                  <Plug className="size-4" />
                  Connect this client&apos;s Google account
                </>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Opens Google&apos;s consent screen in a popup. The client (or
              you, signed in as them) approves once — we never see their
              password.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
