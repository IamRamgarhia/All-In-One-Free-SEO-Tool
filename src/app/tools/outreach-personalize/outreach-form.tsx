"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { runPersonalize, type OutreachState } from "./actions";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export function OutreachForm() {
  const [state, formAction, pending] = useActionState<
    OutreachState | null,
    FormData
  >(runPersonalize, null);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  function copy(kind: "subject" | "body", text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Prospect URL</span>
            <input
              name="prospectUrl"
              required
              placeholder="https://prospect.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Goal (optional)</span>
            <input
              name="goal"
              placeholder="Pitch a guest post / link insertion / partnership"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Subject (optional)</span>
            <input
              name="templateSubject"
              placeholder="Your generic subject line"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Sender name</span>
            <input
              name="senderName"
              placeholder="Your name"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Generic template</span>
          <textarea
            name="template"
            required
            rows={8}
            placeholder={`Hi there,\n\nI write about [topic] over at [site]. Wanted to share a piece I think your readers would like — [link]. Mind if I send the highlights?\n\nThanks,\n[name]`}
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Researching prospect…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Personalize
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && state.result.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Subject
              </span>
              <button
                type="button"
                onClick={() => copy("subject", state.result.ok ? state.result.email.subject : "")}
                className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                {copied === "subject" ? (
                  <>
                    <Check className="mr-1 size-3 text-emerald-300" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-base font-semibold">
              {state.result.email.subject}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Body
              </span>
              <button
                type="button"
                onClick={() => copy("body", state.result.ok ? state.result.email.body : "")}
                className="inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                {copied === "body" ? (
                  <>
                    <Check className="mr-1 size-3 text-emerald-300" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="mt-1 whitespace-pre-wrap rounded-md bg-black/20 p-3 font-sans text-sm leading-relaxed">
              {state.result.email.body}
            </pre>
          </div>
          {state.result.email.signals.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">
                Personalization signals used:{" "}
              </span>
              {state.result.email.signals.map((s) => (
                <span
                  key={s}
                  className="ml-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-200 ring-1 ring-inset ring-rose-500/30"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
          <AiDisclaimer />
        </section>
      )}
    </>
  );
}
