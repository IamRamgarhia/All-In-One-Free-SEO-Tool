"use client";

import { useActionState, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  Wrench,
} from "lucide-react";
import {
  disconnectWpBridge,
  pushWpFix,
  saveWpCreds,
  type SaveCredsResult,
  type WpFixResult,
} from "./wp-actions";

/**
 * Client-detail panel for the WordPress one-click bridge:
 *   - Connect form when no creds saved
 *   - Status + "push fix" form when connected
 *
 * Uses two server actions: saveWpCreds (sets URL + key) and pushWpFix
 * (resolves a URL to a post ID and applies a single-field fix).
 */
export function WpBridgePanel({
  clientId,
  isConnected,
  endpoint,
  looksLikeWordPress,
}: {
  clientId: number;
  isConnected: boolean;
  endpoint: string | null;
  /**
   * Whether WordPress was actually detected on the site.
   *
   * This panel used to render identically for every client, so a plain
   * PHP or static site got a full set of instructions for installing a
   * WordPress plugin it can never run — on the same screen that
   * correctly said "2 techs detected", neither of them WordPress.
   */
  looksLikeWordPress: boolean;
}) {
  // Detection is not proof, so this collapses rather than hides. A site
  // behind a proxy that masks its headers is still WordPress, and the
  // person looking at this screen knows that better than the crawler
  // does. Already-connected wins outright: whatever we detected, the
  // bridge is demonstrably working.
  const [forceOpen, setForceOpen] = useState(false);
  if (!isConnected && !looksLikeWordPress && !forceOpen) {
    return (
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
          <Wrench className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">WordPress one-click bridge</span>
          <span className="text-xs text-muted-foreground">
            Not applicable — this site does not look like WordPress, so fixes
            here are copy-paste rather than one-click. Everything else works
            the same.
          </span>
          <button
            type="button"
            onClick={() => setForceOpen(true)}
            className="ml-auto rounded text-xs text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            It is WordPress — set it up
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="size-4 text-violet-300" />
            WordPress one-click bridge
            {isConnected ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                connected
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
                not connected
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Push title / meta / canonical / schema fixes straight into the
            client&apos;s WordPress site instead of copy-paste. Requires
            our SEO Tool Bridge plugin (free,{" "}
            <code>wordpress-plugin/seo-tool-bridge.php</code>).
          </p>
        </div>
        {isConnected && (
          <form action={disconnectWpBridge.bind(null, clientId)}>
            <button
              type="submit"
              className="text-[10px] text-muted-foreground hover:text-rose-300 hover:underline"
            >
              Disconnect
            </button>
          </form>
        )}
      </header>

      <div className="p-5">
        {isConnected ? (
          <PushFixForm clientId={clientId} endpoint={endpoint ?? ""} />
        ) : (
          <ConnectForm clientId={clientId} />
        )}
      </div>
    </section>
  );
}

function ConnectForm({ clientId }: { clientId: number }) {
  const [state, formAction, pending] = useActionState<
    SaveCredsResult | null,
    FormData
  >(saveWpCreds, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
        <li>
          Install the bridge plugin from{" "}
          <code>wordpress-plugin/seo-tool-bridge.php</code> on the client&apos;s
          WordPress site.
        </li>
        <li>
          In WordPress, go to <strong>Tools → SEO Tool Bridge</strong> to
          copy the REST endpoint and connection key.
        </li>
        <li>Paste both below.</li>
      </ol>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">REST endpoint</span>
          <input
            name="endpoint"
            type="url"
            required
            // Browsers autofilled a saved email address into this field,
            // which then failed to connect with no hint that the value
            // was never typed. A URL type plus an unguessable
            // autocomplete token is what stops the heuristic firing.
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://clientsite.com/wp-json/seo-tool/v1"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Connection key</span>
          <input
            name="key"
            required
            type="password"
            autoComplete="off"
            placeholder="48-char key from the WP admin page"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-3 animate-spin" />
            Connecting…
          </>
        ) : (
          "Connect"
        )}
      </button>

      {state?.ok && (
        <p className="text-xs text-emerald-300">
          ✓ Connected to plugin v{state.pluginVersion ?? "?"}.
        </p>
      )}
      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}
    </form>
  );
}

const FIX_TYPES = [
  { v: "title", l: "Page title" },
  { v: "meta_description", l: "Meta description" },
  { v: "canonical", l: "Canonical URL" },
  { v: "robots", l: "Robots meta" },
  { v: "schema", l: "Inline JSON-LD schema" },
] as const;

function PushFixForm({
  clientId,
  endpoint,
}: {
  clientId: number;
  endpoint: string;
}) {
  const [state, formAction, pending] = useActionState<WpFixResult | null, FormData>(
    pushWpFix,
    null,
  );
  const [fixType, setFixType] = useState<(typeof FIX_TYPES)[number]["v"]>("title");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />

      <p className="text-[11px] text-muted-foreground">
        Plugin reachable at{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5">{endpoint}</code>
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Page URL</span>
          <input
            name="url"
            required
            placeholder="https://clientsite.com/page-to-fix"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">What to fix</span>
          <select
            name="fixType"
            value={fixType}
            onChange={(e) =>
              setFixType(e.target.value as (typeof FIX_TYPES)[number]["v"])
            }
            className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            {FIX_TYPES.map((f) => (
              <option key={f.v} value={f.v}>
                {f.l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">New value</span>
        {fixType === "schema" ? (
          <textarea
            name="value"
            required
            rows={6}
            placeholder='{"@context":"https://schema.org","@type":"Article",...}'
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        ) : (
          <input
            name="value"
            required
            placeholder={
              fixType === "title"
                ? "Better Title — Brand"
                : fixType === "meta_description"
                  ? "150-160 chars, action verb up front…"
                  : fixType === "canonical"
                    ? "https://clientsite.com/canonical-url"
                    : "noindex, follow"
            }
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        )}
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 size-3 animate-spin" />
            Pushing…
          </>
        ) : (
          <>
            <Send className="mr-2 size-3" />
            Push to WordPress
          </>
        )}
      </button>

      {state?.ok && (
        <p className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 className="size-3.5" />
          Updated post #{state.postId}.
        </p>
      )}
      {state && !state.ok && (
        <p className="inline-flex items-start gap-1.5 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          <AlertCircle className="mt-0.5 size-3.5" />
          {state.error}
        </p>
      )}

      <p className="text-[10px] text-muted-foreground">
        Every push is logged + the plugin keeps a revision history so you
        can undo from inside WordPress.{" "}
        <a
          href="https://wordpress.org/support/article/revisions/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Revisions docs <ExternalLink className="inline size-3" />
        </a>
      </p>
    </form>
  );
}
