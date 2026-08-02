"use client";

import { useActionState, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Sparkles,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  parseReportDataPaste,
  deleteEntry,
  type ParseState,
} from "./actions";

const KIND_TONE: Record<string, string> = {
  backlink: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  outreach: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  comment: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  social_post: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  review: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  milestone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  note: "bg-white/5 text-muted-foreground ring-white/10",
};

const EXAMPLE = `Got a do-follow backlink from https://example-blog.com/awesome-roundup — anchor text "modern SEO tool"
Sent outreach to founder@biz.io about a guest post on programmatic SEO
Posted a 500-word case study on LinkedIn — got 47 likes, 12 comments
Comment on Search Engine Journal article about AI Overviews
3 new Google reviews this week — average 5 stars
Site hit page 1 for "self-hosted SEO tool" (was page 3 last month)
Featured on Indie Hackers homepage — DA 80 backlink`;

export function ReportDataPaste({
  clients: clientList,
}: {
  clients: { id: number; name: string; url: string }[];
}) {
  const [state, formAction, pending] = useActionState<ParseState, FormData>(
    parseReportDataPaste,
    null,
  );
  const [rawText, setRawText] = useState("");
  const [, startDelete] = useTransition();

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[2fr_3fr]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Client</span>
            <select
              name="clientId"
              required
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">Pick a client…</option>
              {clientList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setRawText(EXAMPLE)}
              className="text-[11px] text-violet-300 hover:underline"
            >
              Paste example to see how it works →
            </button>
          </div>
        </div>

        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Paste your work (one item per line, free-form text)
          </span>
          <textarea
            name="rawText"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            required
            rows={10}
            placeholder={
              "Examples:\n" +
              "  • Got backlink from forbes.com — anchor 'best SEO tool'\n" +
              "  • Sent outreach email to alex@startup.dev\n" +
              "  • Posted on LinkedIn about Core Web Vitals — 80 reactions\n" +
              "  • Hit position 7 for 'free SEO software' (was 14)\n" +
              "\n" +
              "AI will structure each line into the right report category."
            }
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <button
          type="submit"
          disabled={pending || !rawText.trim()}
          className="inline-flex h-10 items-center rounded-md bg-emerald-500/15 px-5 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              AI is structuring…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Extract + save to report
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Each extracted item shows up in the client&apos;s monthly report under
          &quot;Work completed.&quot; You can edit / delete in the list below
          after AI classifies them.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 className="size-4" />
                Added {state.added} item{state.added === 1 ? "" : "s"} to the report
              </h2>
              <p className="text-[11px] text-muted-foreground">
                These now show up under &quot;Work completed&quot; in the
                client&apos;s next monthly report.
              </p>
            </div>
          </header>
          <ul className="divide-y divide-white/[0.06]">
            {state.items.map((it, i) => (
              <li key={i} className="px-5 py-3 text-sm">
                <div className="flex items-start gap-2">
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      KIND_TONE[it.kind] ?? KIND_TONE.note
                    }`}
                  >
                    {it.kind.replace(/_/g, " ")}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">{it.title}</p>
                    {it.url && (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate text-[11px] text-violet-300 hover:underline"
                      >
                        {it.url}
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                    {it.details && Object.keys(it.details).length > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        {Object.entries(it.details)
                          .map(([k, v]) => `${k}: ${String(v)}`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Suppress unused warn */}
      <div className="hidden">
        <button
          onClick={() => startDelete(async () => deleteEntry(0))}
          type="button"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </>
  );
}
