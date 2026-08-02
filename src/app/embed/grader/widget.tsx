"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Search } from "lucide-react";
import { captureLead, publicGrade, type PublicGradeResult } from "./actions";

const sevTone: Record<string, string> = {
  critical: "text-rose-600 dark:text-rose-400",
  high: "text-rose-600 dark:text-rose-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-slate-500 dark:text-slate-400",
};

export function EmbedGrader({
  agency,
  accent,
  logo,
  tagline,
}: {
  agency: string;
  accent: string;
  logo: string | null;
  tagline: string | null;
}) {
  const [state, action, pending] = useActionState<
    PublicGradeResult | null,
    FormData
  >(publicGrade, null);

  // The iframe has no idea how tall its content is, so the host page
  // would either clip the results or leave a wall of empty space. Post
  // the height out and let the snippet resize us.
  useEffect(() => {
    const send = () => {
      window.parent?.postMessage(
        { type: "seo-grader:height", height: document.body.scrollHeight },
        "*",
      );
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [state, pending]);

  return (
    <div className="mx-auto max-w-2xl p-5">
      <header className="mb-4 flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={agency} className="h-8 max-w-[140px] object-contain" />
        ) : null}
        <div>
          <h1 className="text-lg font-semibold">Free SEO audit</h1>
          <p className="text-xs text-muted-foreground">
            {tagline ?? `A 10-second health check from ${agency}.`}
          </p>
        </div>
      </header>

      <form action={action} className="flex gap-2">
        <input
          name="url"
          type="text"
          required
          placeholder="yourwebsite.com"
          aria-label="Your website address"
          className="h-11 min-w-0 flex-1 rounded-lg border border-black/10 bg-white/80 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          style={{ backgroundColor: accent }}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {pending ? "Checking…" : "Check my site"}
        </button>
      </form>

      {pending && (
        <p className="mt-3 text-xs text-muted-foreground">
          Fetching the page and running 19 checks…
        </p>
      )}

      {state && !state.ok && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state?.ok && <Results result={state} accent={accent} agency={agency} />}

      <p className="mt-5 text-center text-[11px] text-muted-foreground">
        Checks the homepage only. A full audit covers every page.
      </p>
    </div>
  );
}

function Results({
  result,
  accent,
  agency,
}: {
  result: Extract<PublicGradeResult, { ok: true }>;
  accent: string;
  agency: string;
}) {
  const tone =
    result.score >= 80 ? "#059669" : result.score >= 50 ? "#d97706" : "#e11d48";

  return (
    <div className="mt-5 space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
        <div
          className="grid size-20 shrink-0 place-items-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: tone }}
        >
          {result.score}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {result.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {result.counts.critical + result.counts.high > 0
              ? `${result.counts.critical + result.counts.high} issue${result.counts.critical + result.counts.high === 1 ? "" : "s"} worth fixing first`
              : "No serious issues on the homepage"}
            {" · "}
            {result.counts.medium + result.counts.low} smaller
          </div>
        </div>
      </div>

      {result.topFindings.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {result.topFindings.map((f, i) => (
            <li key={`${f.type}-${i}`} className="flex gap-2">
              <span className={`shrink-0 font-medium ${sevTone[f.severity] ?? ""}`}>
                ●
              </span>
              <span className="text-muted-foreground">{f.message}</span>
            </li>
          ))}
        </ul>
      )}

      <LeadForm leadId={result.leadId} accent={accent} agency={agency} />
    </div>
  );
}

/**
 * Asks for an email AFTER showing the score.
 *
 * The reverse — gate the result behind a form — is the pattern everyone
 * has learned to close. CLAUDE.md's onboarding rule is value before
 * asking for anything, and it applies to a stranger on an agency's
 * marketing page more than to anyone else.
 */
function LeadForm({
  leadId,
  accent,
  agency,
}: {
  leadId: number;
  accent: string;
  agency: string;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300">
        <Check className="size-4 shrink-0" />
        Thanks — {agency} will be in touch with the full breakdown.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-sm font-medium">Want the full report?</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        This checked your homepage. Leave an email and {agency} will send the
        full audit — every page, with what to fix first.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          aria-label="Your name"
          className="h-10 min-w-[8rem] flex-1 rounded-lg border border-black/10 bg-white/80 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Your email"
          className="h-10 min-w-[10rem] flex-[2] rounded-lg border border-black/10 bg-white/80 px-3 text-sm text-slate-900 placeholder:text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <button
          type="button"
          disabled={pending || !email}
          style={{ backgroundColor: accent }}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await captureLead({ leadId, email, name });
              if (r.ok) setSent(true);
              else setError(r.error ?? "Couldn't save that.");
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          Send it
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
    </div>
  );
}
