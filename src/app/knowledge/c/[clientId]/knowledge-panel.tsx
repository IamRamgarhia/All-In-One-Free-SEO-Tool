"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  NotebookPen,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  addKnowledgeNote,
  addKnowledgeUrl,
  deleteKnowledgeDocument,
  searchClientKnowledge,
  syncKnowledgeNow,
} from "../../actions";
import type { KbHit } from "@/lib/kb/store";

type Doc = {
  id: number;
  title: string;
  sourceType: string;
  url: string | null;
  chunkCount: number;
  chars: number;
  manual: boolean;
  status: string;
  updatedAt: string;
};

const card = "rounded-2xl border border-border/60 bg-card/60 p-5";
const input =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

/** Matched words come back wrapped in [[ ]]; show them in bold. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function KnowledgePanel({
  clientId,
  editable,
  stats,
  documents,
}: {
  clientId: number;
  editable: boolean;
  stats: { documents: number; passages: number; updatedAt: string | null; vectorModel: string | null; withVectors: number };
  documents: Doc[];
}) {
  const t = useTranslations("knowledge");
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KbHit[] | null>(null);
  const [adding, setAdding] = useState<"note" | "url" | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      setNotice(null);
      await fn();
    });

  return (
    <div className="space-y-6">
      {/* Summary + update */}
      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <p className="m-0 text-sm">
          {t("stats", { documents: stats.documents, passages: stats.passages })}
          <span className="text-muted-foreground">
            {" · "}
            {stats.vectorModel
              ? t("vectors", { done: stats.withVectors, total: stats.passages })
              : t("wordsOnly")}
          </span>
          {stats.updatedAt ? (
            <span className="text-muted-foreground">
              {" · "}
              {t("updated", { when: format.relativeTime(new Date(stats.updatedAt), now) })}
            </span>
          ) : null}
        </p>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const r = await syncKnowledgeNow(clientId);
                  if (r.ok) {
                    setNotice(t("synced", { changed: r.data.changed, removed: r.data.removed }));
                    if (r.data.embedError) setError(t("embedFailed", { error: r.data.embedError }));
                  }
                  router.refresh();
                })
              }
            >
              <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
              {t("sync")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
              aria-pressed={adding === "note"}
              onClick={() => setAdding(adding === "note" ? null : "note")}
            >
              <NotebookPen className="size-4" />
              {t("addNote")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {t("addFile")}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-label={t("addFile")}
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                run(async () => {
                  const body = new FormData();
                  body.append("file", file);
                  const res = await fetch(`/api/knowledge/${clientId}/files`, { method: "POST", body });
                  const r = (await res.json().catch(() => null)) as { ok: boolean; error?: string; passages?: number } | null;
                  if (!r?.ok) return setError(r?.error ?? t("errors.fileUnreadable"));
                  setNotice(t("fileAdded", { name: file.name, count: r.passages ?? 0 }));
                  router.refresh();
                });
              }}
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent"
              aria-pressed={adding === "url"}
              onClick={() => setAdding(adding === "url" ? null : "url")}
            >
              <Globe className="size-4" />
              {t("addUrl")}
            </button>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="m-0 inline-flex items-center gap-1.5 text-sm text-rose-500">
          <AlertCircle className="size-4" />
          {error}
        </p>
      ) : notice ? (
        <p className="m-0 text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>
      ) : null}

      {adding === "note" ? (
        <form
          className={`${card} space-y-3`}
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await addKnowledgeNote(clientId, { title: noteTitle, text: noteText });
              if (!r.ok) return setError(r.error);
              setNoteTitle("");
              setNoteText("");
              setAdding(null);
              setNotice(t("added"));
              router.refresh();
            });
          }}
        >
          <input className={input} placeholder={t("noteTitle")} value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} maxLength={200} aria-label={t("noteTitle")} />
          <textarea
            className={`${input} h-40 py-2`}
            placeholder={t("notePlaceholder")}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            aria-label={t("noteText")}
            required
          />
          <div className="flex justify-end">
            <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </button>
          </div>
        </form>
      ) : null}

      {adding === "url" ? (
        <form
          className={`${card} flex flex-wrap gap-2`}
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await addKnowledgeUrl(clientId, url);
              if (!r.ok) return setError(r.error);
              setUrl("");
              setAdding(null);
              setNotice(t("added"));
              router.refresh();
            });
          }}
        >
          <input className={`${input} min-w-[240px] flex-1`} type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label={t("urlLabel")} required />
          <button type="submit" disabled={pending} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("readPage")}
          </button>
        </form>
      ) : null}

      {/* Test search */}
      <section className={`${card} space-y-3`}>
        <h2 className="m-0 text-sm font-semibold">{t("searchTitle")}</h2>
        <p className="m-0 text-xs text-muted-foreground">{t("searchHint")}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await searchClientKnowledge(clientId, query);
              if (r.ok) setHits(r.data);
            });
          }}
        >
          <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={t("searchTitle")} />
          <button type="submit" disabled={pending || !query.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-60">
            <Search className="size-4" />
            {t("search")}
          </button>
        </form>
        {hits ? (
          hits.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t("noHits")}</p>
          ) : (
            <ol className="m-0 list-none space-y-3 p-0">
              {hits.map((h, i) => (
                <li key={h.chunkId} className="rounded-lg border border-border/50 p-3">
                  <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {i + 1}. {h.title}
                    </span>
                    {h.heading ? <span>· {h.heading}</span> : null}
                    <span>· {t(`types.${h.sourceType}`)}</span>
                    {h.match !== "words" ? (
                      <span className="rounded bg-primary/10 px-1.5 text-primary">{t(`match.${h.match}`)}</span>
                    ) : null}
                  </div>
                  <p className="m-0 text-sm leading-relaxed">
                    <Snippet text={h.snippet} />
                  </p>
                </li>
              ))}
            </ol>
          )
        ) : null}
      </section>

      {/* Documents */}
      <section className={card}>
        <h2 className="m-0 mb-3 text-sm font-semibold">{t("documentsTitle")}</h2>
        {documents.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border/50 p-0">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{d.title}</span>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label={t("open")}>
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{t(`types.${d.sourceType}`)}</span>
                  <span>{t("passages", { count: d.chunkCount })}</span>
                  <span>{format.dateTime(new Date(d.updatedAt), { dateStyle: "medium" })}</span>
                  {editable && d.manual ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-rose-500"
                      aria-label={t("remove", { title: d.title })}
                      title={t("remove", { title: d.title })}
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const r = await deleteKnowledgeDocument(clientId, d.id);
                          if (!r.ok) return setError(r.error);
                          router.refresh();
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
