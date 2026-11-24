"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ExternalLink, GitMerge, Info, Loader2, Play, RefreshCw, Square, TerminalSquare } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { ClientCodeView } from "@/lib/code-agent-view";

export type QueueView = {
  active: boolean;
  total: number;
  attempted: number;
  failed: number;
  current: number | null;
  currentTitle: string | null;
  /** Code of how the last run ended (clientCode.queue.notes). */
  note: string | null;
  noteReason: string | null;
  batch: { code: string; url?: string; detail?: string; branch?: string } | "pending" | null;
};

/**
 * The client's code circuit on the Tasks page, once a client is picked.
 * Owners and managers only (the page decides). Everything shown here is
 * the server's decision; this component only words it and sends clicks.
 *
 *   - Claude Code cannot run: says why, and that "Copy the prompt" on each
 *     task is the way to go without it.
 *   - It can: the queue (one task after another, high priority first) and
 *     the pull requests it opened, with Merge and Merge all, each confirmed.
 */
export function ClientCodePanel({
  clientId,
  clientName,
  view,
  openCount,
  queue,
}: {
  clientId: number;
  clientName: string;
  view: ClientCodeView;
  openCount: number;
  queue: QueueView | null;
}) {
  const t = useTranslations("clientCode");
  const settingsHref = `/clients/${clientId}?tab=settings#code`;

  if (!view.canRun) {
    return (
      <section className="rounded-2xl border border-white/10 bg-card/40 p-4 text-sm">
        <p className="flex items-start gap-2 font-medium">
          <TerminalSquare className="mt-0.5 size-4 shrink-0 text-violet-300" />
          <span>{t("panel.title", { client: clientName })}</span>
        </p>
        <p className="mt-1.5 text-muted-foreground">{t(`reasons.${view.blocker ?? "client_off"}`)}</p>
        <p className="mt-1.5 text-muted-foreground">{t("panel.manual")}</p>
        <Link href={settingsHref} className="mt-3 inline-flex text-xs text-violet-300 hover:underline">
          {t("manual.settings")}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <QueueBar clientId={clientId} clientName={clientName} openCount={openCount} queue={queue} />
      {view.hasRepo && view.prMode !== "off" ? (
        view.tools.gh ? (
          <PrBar clientId={clientId} />
        ) : (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            {t("reasons.no_gh")}
          </p>
        )
      ) : null}
    </div>
  );
}

function QueueBar({
  clientId,
  clientName,
  openCount,
  queue,
}: {
  clientId: number;
  clientName: string;
  openCount: number;
  queue: QueueView | null;
}) {
  const t = useTranslations("clientCode.queue");
  const tr = useTranslations("clientCode.reasons");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = queue?.active === true;
  const waitingBatch = queue?.batch === "pending";

  // The run moves on the server; follow it while it lasts.
  useEffect(() => {
    if (!active && !waitingBatch) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [active, waitingBatch, router]);

  async function call(method: "POST" | "DELETE") {
    if (method === "POST") {
      const ok = await confirmDialog({
        title: t("confirmTitle"),
        description: t("confirmBody", { count: openCount, client: clientName }),
        confirmLabel: t("start"),
        cancelLabel: t("cancel"),
      });
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/task-queue/${clientId}`, { method });
      const data = (await res.json()) as { ok: boolean; code?: string };
      if (!data.ok) setError(data.code && tr.has(data.code) ? tr(data.code) : t("failed"));
    } catch {
      setError(t("unreachable"));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const note = queue && !active ? noteText(queue, t, tr) : null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 text-xs">
        {active ? (
          <>
            <div className="font-medium text-violet-200">
              {t("running", {
                client: clientName,
                n: Math.min(queue.attempted, queue.total),
                total: queue.total,
              })}
              {queue.failed > 0 && <span className="text-rose-300"> · {t("failedCount", { count: queue.failed })}</span>}
            </div>
            {queue.current && (
              <Link
                href={`/tasks/${queue.current}/chat`}
                className="mt-0.5 block max-w-full truncate text-muted-foreground hover:text-foreground hover:underline"
              >
                {t("now", { title: queue.currentTitle ?? `#${queue.current}` })}
              </Link>
            )}
          </>
        ) : (
          <>
            <div className="font-medium">{t("idleTitle", { client: clientName })}</div>
            <div className="text-muted-foreground">{t("idleBody", { count: openCount })}</div>
            {note && <div className="mt-1 break-words text-foreground/80">{note}</div>}
          </>
        )}
        {error && (
          <div role="alert" className="mt-1 text-rose-300">
            {error}
          </div>
        )}
      </div>
      {active ? (
        <button
          type="button"
          onClick={() => call("DELETE")}
          disabled={busy}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          {t("stop")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => call("POST")}
          disabled={busy || openCount === 0}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/30 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {t("start")}
        </button>
      )}
    </section>
  );
}

type T = ReturnType<typeof useTranslations>;

function noteText(q: QueueView, t: T, tr: T): string | null {
  const parts: string[] = [];
  if (q.note === "blocked" && q.noteReason) {
    parts.push(tr.has(q.noteReason) ? tr(q.noteReason) : t("failed"));
  } else if (q.note && t.has(`notes.${q.note}`)) {
    parts.push(t(`notes.${q.note}`));
  }
  if (q.batch === "pending") parts.push(t("batch.pending"));
  else if (q.batch) {
    const b = q.batch;
    if (t.has(`batch.${b.code}`)) {
      parts.push(t(`batch.${b.code}`, { url: b.url ?? "", detail: b.detail ?? "", branch: b.branch ?? "" }));
    }
  }
  return parts.length ? parts.join(" ") : null;
}

type Pr = {
  number: number;
  title: string;
  url: string;
  taskId: number | null;
  checks: "passing" | "pending" | "failing" | "none";
  mergeable: boolean;
  draft: boolean;
  ready: boolean;
};

type MergeResult = { number: number; ok: boolean; code: string; detail?: string };

const CHECK_CLS: Record<Pr["checks"], string> = {
  passing: "text-emerald-300",
  pending: "text-amber-300",
  failing: "text-rose-300",
  none: "text-muted-foreground",
};

function blockedKey(pr: Pr): string | null {
  if (pr.ready) return null;
  if (pr.draft) return "draft";
  if (!pr.mergeable) return "conflicts";
  if (pr.checks === "pending") return "checks_pending";
  if (pr.checks === "failing") return "check_failed";
  return null;
}

/**
 * The pull requests Claude Code opened for this client's tasks (ported
 * from 464001e). Merge and Merge all ask for a confirmation first; the
 * server reads each pull request again right before merging it.
 */
function PrBar({ clientId }: { clientId: number }) {
  const t = useTranslations("clientCode.prs");
  const [prs, setPrs] = useState<Pr[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [results, setResults] = useState<MergeResult[]>([]);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((n) => n + 1);

  const failure = (code?: string, detail?: string) =>
    `${code && t.has(`codes.${code}`) ? t(`codes.${code}`) : t("codes.gh_error")}${detail ? ` (${detail})` : ""}`;

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/task-pr/${clientId}`, { cache: "no-store" });
        const data = (await res.json()) as { ok: boolean; prs?: Pr[]; code?: string; detail?: string };
        if (!live) return;
        if (data.ok) {
          setPrs(data.prs ?? []);
          setError(null);
        } else {
          setError(failure(data.code, data.detail));
        }
      } catch {
        if (live) setError(t("unreachable"));
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 20_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
    // failure/t are stable for the page's language
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tick]);

  async function merge(body: { number: number } | { all: true }, count: number) {
    const ok = await confirmDialog(
      "number" in body
        ? {
            title: t("confirmOneTitle", { number: body.number }),
            description: t("confirmOneBody"),
            confirmLabel: t("merge"),
            cancelLabel: t("cancel"),
          }
        : {
            title: t("confirmAllTitle", { count }),
            description: t("confirmAllBody"),
            confirmLabel: t("mergeAll", { count }),
            cancelLabel: t("cancel"),
          },
    );
    if (!ok) return;
    setBusy("number" in body ? body.number : "all");
    setResults([]);
    try {
      const res = await fetch(`/api/task-pr/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; results?: MergeResult[]; code?: string; detail?: string };
      if (data.results) setResults(data.results);
      else if (!data.ok) setError(failure(data.code, data.detail));
    } catch {
      setError(t("unreachable"));
    } finally {
      setBusy(null);
      reload();
    }
  }

  const ready = (prs ?? []).filter((p) => p.ready);

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-medium text-emerald-200">
            {prs === null ? t("loading") : t("count", { count: prs.length })}
          </div>
          <div className="text-muted-foreground">{t("hint")}</div>
        </div>
        <button
          type="button"
          onClick={reload}
          aria-label={t("refresh")}
          title={t("refresh")}
          className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={busy !== null || ready.length === 0}
          onClick={() => void merge({ all: true }, ready.length)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 font-medium text-emerald-200 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <GitMerge className="size-3.5" />}
          {t("mergeAll", { count: ready.length })}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 break-words text-rose-300">
          {error}
        </p>
      )}

      {prs && prs.length > 0 && (
        <ul className="mt-2 divide-y divide-white/5">
          {prs.map((p) => {
            const blocked = blockedKey(p);
            return (
              <li key={p.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 max-w-full flex-1 basis-full items-center gap-1 hover:underline sm:basis-auto"
                >
                  <span className="text-muted-foreground">#{p.number}</span>
                  <span className="truncate">{p.title}</span>
                  <ExternalLink className="size-3 shrink-0 opacity-60" />
                </a>
                <span className={CHECK_CLS[p.checks]}>{t(`checks.${p.checks}`)}</span>
                {blocked && <span className="text-muted-foreground">· {t(`codes.${blocked}`)}</span>}
                <button
                  type="button"
                  disabled={busy !== null || !p.ready}
                  onClick={() => void merge({ number: p.number }, 1)}
                  className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md bg-white/5 px-2 py-1 font-medium ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-40"
                >
                  {busy === p.number ? <Loader2 className="size-3 animate-spin" /> : <GitMerge className="size-3" />}
                  {t("merge")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {results.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {results.map((r) => (
            <li key={r.number} className={`break-words ${r.ok ? "text-emerald-300" : "text-rose-300"}`}>
              {t("resultLine", { number: r.number, text: r.ok ? t("codes.merged") : failure(r.code, r.detail) })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
