"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importBingBacklinksAction } from "./bing-actions";

/**
 * Pull backlinks from Bing Webmaster Tools.
 *
 * The copy carries the limitations rather than hiding them. Backlinks
 * are this project's weakest data and the README says so; a button that
 * implied "here is your backlink profile" would undo that honesty in the
 * one place a user acts on it.
 */
export function BingBacklinkImport({
  clientId,
  hasKey,
}: {
  clientId: number;
  hasKey: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <section className="glass-apple rounded-xl p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Database className="size-4 text-emerald-300" />
        Import from Bing Webmaster Tools
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Microsoft shares their own link graph for sites you&apos;ve verified,
        free. It&apos;s the best backlink data a self-hosted tool can get —
        with three honest limits: it only covers{" "}
        <strong className="font-medium text-foreground">your</strong> verified
        sites, not competitors; it&apos;s Bing&apos;s index rather than
        Google&apos;s, so the two overlap without matching; and Bing
        publishes no authority score, so that column stays empty rather than
        being filled with a number we made up.
      </p>

      {!hasKey ? (
        <p className="mt-3 rounded-md bg-white/5 px-3 py-2 text-xs text-muted-foreground">
          No Bing API key yet. Get one free at{" "}
          <a
            href="https://www.bing.com/webmasters"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            bing.com/webmasters
          </a>{" "}
          → Settings → API access, then add it in Settings.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setResult(null);
                setFailed(false);
                const r = await importBingBacklinksAction(clientId);
                if (!r.ok) {
                  setFailed(true);
                  setResult(r.error ?? "The import failed.");
                  return;
                }
                const parts: string[] = [];
                if (r.added) parts.push(`${r.added} new`);
                if (r.updated) parts.push(`${r.updated} refreshed`);
                setResult(
                  (parts.length
                    ? `${parts.join(", ")} — from ${r.scannedPages} page${r.scannedPages === 1 ? "" : "s"} checked.`
                    : "Nothing new.") + (r.note ? ` ${r.note}` : ""),
                );
                router.refresh();
              })
            }
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Database className="size-3.5" />
            )}
            Import backlinks
          </Button>
          <span className="text-xs text-muted-foreground">
            Safe to re-run — existing links are refreshed, not duplicated, and
            anything you edited by hand is left alone.
          </span>
        </div>
      )}

      {result && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            failed
              ? "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/25"
              : "bg-emerald-500/10 text-emerald-200 ring-1 ring-inset ring-emerald-500/25"
          }`}
        >
          {result}
        </p>
      )}
    </section>
  );
}
