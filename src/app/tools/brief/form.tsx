"use client";

import { useActionState, useState } from "react";
import { Check, Copy, FileText, Loader2 } from "lucide-react";
import { runBrief, type BriefState } from "./actions";

export function BriefForm() {
  const [state, formAction, pending] = useActionState<BriefState | null, FormData>(
    runBrief,
    null,
  );
  const [copied, setCopied] = useState(false);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px]">
          <input
            name="query"
            required
            placeholder="best running shoes for plantar fasciitis"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="clientDomain"
            placeholder="yoursite.com (optional)"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            name="country"
            defaultValue="US"
            maxLength={4}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-emerald-500/15 px-5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Pulling SERP corpus + writing brief… (1-2 min)
            </>
          ) : (
            <>
              <FileText className="mr-2 size-4" />
              Generate brief
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Intent" value={state.result.intent} />
            <Stat
              label="Target words"
              value={`${state.result.targetWordCount.min}-${state.result.targetWordCount.max}`}
              hint={`ideal ~${state.result.targetWordCount.ideal}`}
            />
            <Stat label="SERP signals" value={`${state.result.topTerms.length} terms · ${state.result.recurringHeadings.length} headings`} />
          </div>

          {state.result.brief && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                <h2 className="text-sm font-semibold">Brief</h2>
                <button
                  type="button"
                  onClick={() => copy(state.result.brief)}
                  className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 size-3 text-emerald-300" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 size-3" />
                      Copy markdown
                    </>
                  )}
                </button>
              </header>
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap p-5 font-sans text-sm leading-relaxed">
                {state.result.brief}
              </pre>
            </section>
          )}

          {state.result.serpUrls.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">SERP sources</h3>
              <ul className="space-y-0.5 text-xs">
                {state.result.serpUrls.map((u, i) => (
                  <li key={u} className="truncate">
                    <span className="text-muted-foreground tabular-nums">
                      {i + 1}.
                    </span>{" "}
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-300 hover:underline"
                    >
                      {u}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
