"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateShareToken,
  revokeShareToken,
} from "../share-actions";

export function ShareCard({
  clientId,
  shareToken,
}: {
  clientId: number;
  shareToken: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const url =
    typeof window !== "undefined" && shareToken
      ? `${window.location.origin}/portal/${shareToken}`
      : shareToken
        ? `/portal/${shareToken}`
        : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-fuchsia-500/15 blur-3xl" />
      <header className="relative border-b border-white/5 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Link2 className="size-4 text-fuchsia-300" />
          Client portal
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Generate a read-only link your client can open. Shows score, audit
          history, completed work, and what&apos;s in progress — no login.
        </p>
      </header>
      <div className="relative space-y-3 p-5">
        {!shareToken ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(() => generateShareToken(clientId))
              }
              className="shadow-md shadow-fuchsia-500/20"
            >
              <Link2 className="size-4" />
              {pending ? "Generating…" : "Generate share link"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Anyone with the link can view (read-only).
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <code className="flex-1 truncate font-mono text-xs text-foreground/90">
                {url}
              </code>
              <button
                type="button"
                onClick={copy}
                className={
                  copied
                    ? "inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
                    : "inline-flex shrink-0 items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-inset ring-white/10 hover:bg-white/10"
                }
              >
                {copied ? (
                  <Check className="size-3" />
                ) : (
                  <Copy className="size-3" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(() => generateShareToken(clientId))
                }
                className="border-white/10 bg-white/5"
              >
                <RefreshCw className="size-3" />
                Regenerate
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(() => revokeShareToken(clientId))
                }
                className="border-rose-500/20 bg-rose-500/5 text-rose-300 hover:bg-rose-500/10"
              >
                <Trash2 className="size-3" />
                Revoke
              </Button>
              <span className="text-muted-foreground">
                Regenerating invalidates the old link immediately.
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
