"use client";

import { useActionState } from "react";
import { AlertCircle, ArrowRight, ExternalLink, Loader2, Star } from "lucide-react";
import { runLinkGraph, type LinkGraphState } from "./actions";

export function LinkGraphForm() {
  const [state, formAction, pending] = useActionState<
    LinkGraphState | null,
    FormData
  >(runLinkGraph, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Start URL</span>
            <input
              name="startUrl"
              required
              placeholder="https://example.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Max pages</span>
            <input
              name="maxPages"
              type="number"
              min={20}
              max={200}
              defaultValue={150}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center self-end rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                Analysing… (1-3 min)
              </>
            ) : (
              "Analyse"
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Pages analysed"
              value={state.analysis.pages.length}
              tone="neutral"
            />
            <Stat
              label="Total internal links"
              value={state.analysis.totalLinks}
              tone="violet"
            />
            <Stat
              label="Orphans"
              value={state.analysis.orphans.length}
              tone={state.analysis.orphans.length > 0 ? "rose" : "emerald"}
            />
            <Stat
              label="Hub pages"
              value={state.analysis.hubs.length}
              tone="emerald"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <DownloadButton
              filename="link-graph.json"
              mime="application/json"
              content={JSON.stringify(state.analysis, null, 2)}
              label="JSON"
            />
            <DownloadButton
              filename="link-graph-pages.csv"
              mime="text/csv"
              content={pagesToCsv(state.analysis.pages)}
              label="Pages CSV"
            />
            <DownloadButton
              filename="link-graph-orphans.csv"
              mime="text/csv"
              content={orphansToCsv(state.analysis.suggestions)}
              label="Orphan suggestions CSV"
            />
          </div>

          {state.analysis.suggestions.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <AlertCircle className="size-4 text-rose-300" />
                  Orphan pages — {state.analysis.suggestions.length} need
                  inbound links
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  For each, the top-3 most-relevant source pages (by
                  TF-IDF cosine similarity). Add a contextual link from
                  one of them.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.analysis.suggestions.map((s) => (
                  <li key={s.orphanUrl} className="px-5 py-4 space-y-2">
                    <a
                      href={s.orphanUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                    >
                      {s.orphanUrl.replace(/^https?:\/\/[^/]+/, "")}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                    <ul className="space-y-1.5 pl-4">
                      {s.candidates.map((c) => (
                        <li
                          key={c.url}
                          className="flex items-start gap-2 text-xs"
                        >
                          <ArrowRight className="mt-0.5 size-3 shrink-0 text-violet-300" />
                          <div className="min-w-0 flex-1">
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium hover:underline"
                            >
                              {c.titleSnippet ||
                                c.url.replace(/^https?:\/\/[^/]+/, "")}
                            </a>
                            <div className="text-[10px] text-muted-foreground">
                              similarity: {(c.score * 100).toFixed(1)}%
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {state.analysis.hubs.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Star className="size-4 text-emerald-300" />
                  Hub pages
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Pages with 5+ inbound internal links. They&apos;re your
                  authority distributors — make sure they link to your
                  most-important pages.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.analysis.hubs.map((p) => (
                  <li
                    key={p.url}
                    className="flex items-center gap-3 px-5 py-3 text-sm"
                  >
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 flex-1 items-center gap-1 truncate font-medium hover:underline"
                    >
                      {p.title ||
                        p.url.replace(/^https?:\/\/[^/]+/, "")}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                      ← {p.inbound}
                    </span>
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10">
                      → {p.outbound}
                    </span>
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

function DownloadButton({
  filename,
  mime,
  content,
  label,
}: {
  filename: string;
  mime: string;
  content: string;
  label: string;
}) {
  const dataUri = `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
  return (
    <a
      href={dataUri}
      download={filename}
      className="inline-flex h-8 items-center gap-1 rounded-md bg-white/5 px-3 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
    >
      ↓ {label}
    </a>
  );
}

function pagesToCsv(
  pages: { url: string; title: string; inbound: number; outbound: number; wordCount: number }[],
): string {
  const header = "url,title,inbound,outbound,word_count\n";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return (
    header +
    pages
      .map(
        (p) =>
          `${escape(p.url)},${escape(p.title)},${p.inbound},${p.outbound},${p.wordCount}`,
      )
      .join("\n")
  );
}

function orphansToCsv(
  suggestions: {
    orphanUrl: string;
    candidates: { url: string; score: number; titleSnippet: string }[];
  }[],
): string {
  const header = "orphan_url,candidate_url,similarity_score,candidate_title\n";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows: string[] = [];
  for (const s of suggestions) {
    for (const c of s.candidates) {
      rows.push(
        `${escape(s.orphanUrl)},${escape(c.url)},${c.score.toFixed(4)},${escape(c.titleSnippet)}`,
      );
    }
  }
  return header + rows.join("\n");
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "violet" | "rose" | "emerald";
}) {
  const t = {
    neutral: "text-foreground",
    violet: "text-violet-300",
    rose: "text-rose-300",
    emerald: "text-emerald-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>
        {value}
      </div>
    </div>
  );
}
