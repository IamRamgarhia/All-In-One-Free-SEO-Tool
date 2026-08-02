"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The snippet an agency pastes onto their marketing site.
 *
 * Built in the browser rather than server-side because the origin has to
 * be the one the AGENCY reaches this app on — which might be
 * localhost:3000, a LAN address, or a domain behind a reverse proxy.
 * Guessing it server-side would hand people a snippet pointing at the
 * wrong host, and the iframe would silently render nothing.
 */
/**
 * The origin never changes, so there is nothing to subscribe to — but
 * useSyncExternalStore is still the right primitive for a value that
 * exists in the browser and not on the server. Reading it in an effect
 * and calling setState causes the cascading render React 19 warns about,
 * and this codebase has already been through that cleanup once.
 */
const subscribeNever = () => () => {};
const readOrigin = () => window.location.origin;
const readOriginOnServer = () => "";

export function EmbedSnippet() {
  const origin = useSyncExternalStore(
    subscribeNever,
    readOrigin,
    readOriginOnServer,
  );
  const [copied, setCopied] = useState<"iframe" | null>(null);

  const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(origin);

  const snippet = `<iframe
  src="${origin || "https://your-seo-tool-host"}/embed/grader"
  style="width:100%;border:0;min-height:420px"
  title="Free SEO audit"
  loading="lazy"
></iframe>
<script>
  // The widget posts its height whenever the content changes, so the
  // iframe grows with the results instead of clipping them.
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "seo-grader:height") {
      var f = document.querySelector('iframe[src*="/embed/grader"]');
      if (f) f.style.height = e.data.height + "px";
    }
  });
</script>`;

  return (
    <section className="glass-apple rounded-xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Code2 className="size-4 text-emerald-300" />
        Put the audit widget on your site
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Paste this where you want it to appear. Visitors grade their own site,
        see what&apos;s wrong, and can leave an email for the full report —
        which lands here. It uses your brand name, colour and logo from
        Settings.
      </p>

      {local && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-200 ring-1 ring-inset ring-amber-500/25">
          You&apos;re on <code className="font-mono">{origin}</code>, which only
          works from this machine. For the widget to work on a public site, this
          app needs to be reachable at a public address — a domain pointed at
          your server, or a tunnel. The snippet will use whatever address you
          open the app on.
        </p>
      )}

      <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <code>{snippet}</code>
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(snippet);
            setCopied("iframe");
            setTimeout(() => setCopied(null), 2000);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy snippet"}
        </Button>
        <a
          href="/embed/grader"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        >
          <ExternalLink className="size-3.5" />
          Preview it
        </a>
      </div>
    </section>
  );
}
