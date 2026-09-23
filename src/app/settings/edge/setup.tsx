"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rotateEdgeTokenAction } from "./actions";

type ClientRow = { id: number; name: string; url: string | null };

/**
 * The three values the worker needs, and the worker itself.
 *
 * The token is shown exactly once, on the rotation that created it, and
 * never again — this page reads whether one exists, not what it is. A
 * secret rendered on every page load is a secret in every screenshot,
 * every screen share and every browser cache, and this one authorises
 * reading the rewrite set for every site on the install.
 */
export function EdgeSetup({
  hasToken,
  clients,
  workerSource,
}: {
  hasToken: boolean;
  appUrl: string;
  clients: ClientRow[];
  workerSource: string;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<number | null>(
    clients[0]?.id ?? null,
  );

  const rotate = () => {
    setError(null);
    start(async () => {
      const r = await rotateEdgeTokenAction();
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setToken(r.token);
    });
  };

  return (
    <section className="glass-apple space-y-4 rounded-2xl p-5">
      <h2 className="text-sm font-semibold">Set it up</h2>

      <ol className="ml-4 list-decimal space-y-4 text-sm text-muted-foreground">
        <li>
          <span className="text-foreground">Generate a token.</span>{" "}
          {hasToken && !token
            ? "One already exists. Generating a new one stops the old worker until you update it."
            : "The worker sends this to prove it is yours."}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={rotate} disabled={pending}>
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {hasToken ? "Generate a new token" : "Generate token"}
            </Button>
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
          {token && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Copy this now. It is not shown again — this screen only knows
                whether a token exists, not what it is.
              </p>
              <CopyRow value={token} />
            </div>
          )}
        </li>

        <li>
          <span className="text-foreground">Pick the site.</span> Each worker
          serves one client, so its id goes in the config.
          <select
            value={clientId ?? ""}
            onChange={(e) => setClientId(Number(e.target.value))}
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.url ?? "no URL"}
              </option>
            ))}
          </select>
        </li>

        <li>
          <span className="text-foreground">Create the worker.</span> In
          Cloudflare, go to Workers &amp; Pages, Create, and paste this in.
          <CopyBlock value={workerSource} label="worker source" />
        </li>

        <li>
          <span className="text-foreground">Add three variables</span> under the
          worker&apos;s Settings, then Variables.
          <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-[12px] leading-relaxed text-foreground/90">
            {`SEO_TOOL_URL    ${typeof window === "undefined" ? "https://your-seo-tool" : window.location.origin}
SEO_TOOL_TOKEN  the token from step 1
SEO_CLIENT_ID   ${clientId ?? "…"}`}
          </pre>
          <p className="mt-1 text-xs">
            The worker has to be able to reach that URL. On a laptop-only
            install it cannot, so this needs the tool running somewhere with a
            public address.
          </p>
        </li>

        <li>
          <span className="text-foreground">Add a route</span> for the site,
          such as <code>example.com/*</code>. Fixes appear within five minutes,
          which is how long the worker caches them.
        </li>
      </ol>
    </section>
  );
}

function CopyRow({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 font-mono text-[11px]">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => {
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            },
            () => undefined,
          );
        }}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {done ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}

function CopyBlock({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  if (!value) {
    return (
      <p className="mt-2 text-xs text-destructive">
        Could not read edge-worker/seo-tool-worker.js from the install.
      </p>
    );
  }
  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value).then(
            () => {
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            },
            () => undefined,
          );
        }}
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {done ? "Copied" : `Copy the ${label}`}
      </Button>
      <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-relaxed text-foreground/80">
        {value.slice(0, 1200)}
        {value.length > 1200 ? "\n…" : ""}
      </pre>
    </div>
  );
}
