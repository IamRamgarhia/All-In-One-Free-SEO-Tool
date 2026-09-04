"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, X, Circle, Copy } from "lucide-react";
import { runAiRobotsAudit } from "./actions";
import { usePresetClientId, usePresetUrl } from "@/components/use-preset-url";
import type { RobotsAudit } from "@/lib/ai-bot-robots";

const STATUS_META: Record<
  "explicit-allow" | "explicit-block" | "star-default" | "missing",
  { label: string; tone: string; icon: React.ReactNode }
> = {
  "explicit-allow": {
    label: "Explicitly allowed",
    tone: "text-emerald-300",
    icon: <Check className="size-3.5" />,
  },
  "explicit-block": {
    label: "Explicitly blocked",
    tone: "text-rose-300",
    icon: <X className="size-3.5" />,
  },
  "star-default": {
    label: "Falls under * wildcard",
    tone: "text-amber-300",
    icon: <Circle className="size-3.5" />,
  },
  missing: {
    label: "No rule (crawler-default)",
    tone: "text-amber-300",
    icon: <Circle className="size-3.5" />,
  },
};

export function AiRobotsForm() {
  // Prefilled when the tool is opened from a client, so the domain is
  // not retyped and the findings attach to the right client.
  const presetUrl = usePresetUrl();
  const clientId = usePresetClientId();
  const [url, setUrl] = useState(presetUrl);
  const [result, setResult] = useState<RobotsAudit | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setResult(null);
    setCopied(false);
    startTransition(async () => {
      // The client id matters more than it looks. Without it the
      // findings this records have no client, so the agent — which
      // plans per client — never sees them, and the tool goes back to
      // computing an answer that reaches nothing.
      const r = await runAiRobotsAudit(url.trim(), clientId ?? undefined);
      setResult(r);
    });
  }

  function copyPatch() {
    if (!result?.ok || !result.suggestedPatch) return;
    navigator.clipboard.writeText(result.suggestedPatch).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-card/40 p-5 sm:flex-row"
      >
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="h-10 flex-1 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-violet-500/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !url.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-violet-500 px-4 text-sm font-medium text-white shadow hover:bg-violet-400 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Fetching robots.txt…
            </>
          ) : (
            "Audit AI bots"
          )}
        </button>
      </form>

      {result && !result.ok && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          <div className="font-semibold">Couldn&apos;t fetch robots.txt</div>
          <p className="mt-1 text-rose-200/80">{result.error}</p>
        </div>
      )}

      {result && result.ok && (
        <>
          {/* Headline stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="AI bots addressed"
              value={`${result.bots.length - result.unaddressedCount}/${result.bots.length}`}
              tone={
                result.unaddressedCount === 0
                  ? "emerald"
                  : result.unaddressedCount < 5
                    ? "amber"
                    : "rose"
              }
            />
            <StatCard
              label="Unaddressed"
              value={String(result.unaddressedCount)}
              tone={result.unaddressedCount === 0 ? "emerald" : "rose"}
            />
            <StatCard
              label="robots.txt size"
              value={`${result.rawBytes} B`}
              tone="neutral"
            />
          </div>

          {/* Per-bot detail table */}
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h2 className="text-base font-semibold">Per-crawler status</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Fetched {result.url} · {new Date(result.fetchedAt).toLocaleString()}
              </p>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 text-left font-medium">Bot</th>
                  <th className="px-3 py-3 text-left font-medium">Vendor</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-3 py-3 text-left font-medium">Currently</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {result.bots.map((b) => {
                  const meta = STATUS_META[b.status];
                  return (
                    <tr key={b.ua} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs">{b.ua}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {b.purpose}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <a
                          href={b.docs}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {b.vendor} ↗
                        </a>
                      </td>
                      <td className={`px-3 py-3 text-xs ${meta.tone}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {meta.icon}
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span
                          className={
                            b.effectivelyBlocked
                              ? "text-rose-300"
                              : "text-emerald-300"
                          }
                        >
                          {b.effectivelyBlocked ? "Blocked" : "Allowed"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Copy-paste patch block */}
          {result.suggestedPatch ? (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
              <header className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">
                    Suggested patch for your robots.txt
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Default is Disallow (opt out of training). Flip
                    Disallow → Allow for any bot you want to permit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={copyPatch}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs font-medium hover:bg-white/[0.08]"
                >
                  <Copy className="size-3.5" />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </header>
              <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-4 text-[11px] leading-relaxed">
                {result.suggestedPatch}
              </pre>
            </section>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
              <div className="font-semibold">All AI bots addressed ✓</div>
              <p className="mt-1 text-emerald-200/80">
                Every known AI crawler has an explicit rule in your robots.txt.
                No patch needed.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "rose" | "neutral";
}) {
  const toneClass: Record<string, string> = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-300",
    neutral: "border-white/[0.06] bg-white/[0.02] text-muted-foreground",
  };
  return (
    <div className={`rounded-xl border p-4 ${toneClass[tone]}`}>
      <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
