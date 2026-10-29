"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  ListChecks,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openChat } from "@/components/claude/dock-store";
import { AiFeedback } from "@/components/ai-feedback";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  applySuggestion,
  dismissSuggestion,
  reopenSuggestion,
  runAgent,
  runAgentExecute,
  suggestionToTask,
} from "@/app/agent/actions";
import type { AgentRunReport } from "@/lib/seo-agent-runner";

export type SuggestionRow = {
  id: number;
  type:
    | "title_rewrite"
    | "meta_description_rewrite"
    | "quick_win_action"
    | "content_idea"
    | "internal_link"
    | "schema_markup"
    | "h1_rewrite"
    | "general";
  priority: "high" | "medium" | "low";
  targetUrl: string | null;
  currentValue: string | null;
  suggestedValue: string;
  rationale: string | null;
  source: "audit" | "gsc" | "niche" | "competitor" | "agent";
  status: "new" | "applied" | "dismissed";
  createdAt: Date;
};

const typeLabel: Record<SuggestionRow["type"], string> = {
  title_rewrite: "Title rewrite",
  meta_description_rewrite: "Meta description",
  h1_rewrite: "H1 rewrite",
  quick_win_action: "Quick win",
  content_idea: "Content idea",
  internal_link: "Internal link",
  schema_markup: "Schema markup",
  general: "Suggestion",
};

const typeTone: Record<SuggestionRow["type"], string> = {
  title_rewrite: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  meta_description_rewrite: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  h1_rewrite: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  quick_win_action: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  content_idea: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  internal_link: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30",
  schema_markup: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  general: "bg-white/5 text-muted-foreground ring-white/10",
};

const priorityTone: Record<SuggestionRow["priority"], string> = {
  high: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  medium: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  low: "bg-white/5 text-muted-foreground ring-white/10",
};

type FilterStatus = "new" | "applied" | "dismissed" | "all";

export function SuggestionsList({
  clientId,
  initialSuggestions,
  aiReady,
}: {
  clientId: number;
  initialSuggestions: SuggestionRow[];
  aiReady: boolean;
}) {
  const [filter, setFilter] = useState<FilterStatus>("new");
  const [runPending, startRun] = useTransition();
  const [execPending, startExec] = useTransition();
  const [execReport, setExecReport] = useState<AgentRunReport | null>(null);
  const [runMessage, setRunMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const filtered =
    filter === "all"
      ? initialSuggestions
      : initialSuggestions.filter((s) => s.status === filter);

  const counts = {
    new: initialSuggestions.filter((s) => s.status === "new").length,
    applied: initialSuggestions.filter((s) => s.status === "applied").length,
    dismissed: initialSuggestions.filter((s) => s.status === "dismissed").length,
    all: initialSuggestions.length,
  };

  function run() {
    setRunMessage(null);
    startRun(async () => {
      const r = await runAgent(clientId);
      if (!r.ok) {
        setRunMessage({ tone: "error", text: r.error });
        return;
      }
      setRunMessage({
        tone: "success",
        text: `Created ${r.created} new suggestion${r.created === 1 ? "" : "s"}${
          r.reused > 0 ? ` (${r.reused} duplicates skipped)` : ""
        }.`,
      });
    });
  }

  return (
    <div className="space-y-4">
      {/* Run controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={runPending || !aiReady}>
          {runPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Agent thinking… (~30-60s)
            </>
          ) : (
            <>
              <Bot className="size-4" />
              {initialSuggestions.length === 0 ? "Run agent" : "Run agent again"}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          disabled={
            execPending ||
            initialSuggestions.filter((s) => s.status === "new").length === 0
          }
          onClick={() => {
            setExecReport(null);
            startExec(async () => {
              const r = await runAgentExecute(clientId);
              setExecReport(r);
            });
          }}
          title="Auto-apply title/meta suggestions via the WP bridge and queue everything else as tasks. Bounded: max 20 actions, 60s wall-clock."
        >
          {execPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Executing…
            </>
          ) : (
            <>
              <Bot className="size-3.5" />
              Execute pending
            </>
          )}
        </Button>
        {runMessage && (
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              runMessage.tone === "success"
                ? "text-emerald-300"
                : "text-rose-300"
            }`}
          >
            {runMessage.tone === "success" ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <AlertCircle className="size-3.5" />
            )}
            {runMessage.text}
          </span>
        )}
      </div>

      {execReport && (
        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 text-xs">
          <p className="font-medium text-violet-200">
            Agent execution: {execReport.applied} auto-applied,{" "}
            {execReport.queued} queued as tasks, {execReport.skipped} skipped ·{" "}
            {Math.round(execReport.durationMs / 100) / 10}s
          </p>
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {execReport.actions.slice(0, 8).map((a) => (
              <li key={a.suggestionId}>
                <span
                  className={
                    a.outcome === "auto_applied"
                      ? "text-emerald-300"
                      : a.outcome === "queued_as_task"
                        ? "text-cyan-300"
                        : "text-amber-300"
                  }
                >
                  · {a.outcome.replace(/_/g, " ")}
                </span>{" "}
                — {a.type}
                {a.targetUrl ? ` · ${new URL(a.targetUrl).pathname}` : ""}
                {a.detail ? ` — ${a.detail}` : ""}
              </li>
            ))}
            {execReport.actions.length > 8 && (
              <li>… and {execReport.actions.length - 8} more</li>
            )}
          </ul>
        </section>
      )}

      {/* Filters */}
      {initialSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Filter className="size-3.5 text-muted-foreground" />
          {(["new", "applied", "dismissed", "all"] as FilterStatus[]).map(
            (f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
                  filter === f
                    ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                    : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10 hover:text-foreground"
                }`}
              >
                {f} ({counts[f]})
              </button>
            ),
          )}
        </div>
      )}

      {/* Suggestions */}
      {filtered.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center">
          {initialSuggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No suggestions yet. Click <strong>Run agent</strong> to generate
              the first batch.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing in this filter. Try another tab.
            </p>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => (
            <SuggestionCard key={s.id} s={s} clientId={clientId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SuggestionCard({
  s,
  clientId,
}: {
  s: SuggestionRow;
  clientId: number;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(s.suggestedValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Make (or reuse) the task for this suggestion, start Claude on it and
  // show the chat in the corner dock.
  function doWithClaude() {
    startTransition(async () => {
      const made = await suggestionToTask(s.id);
      if (!made) return;
      try {
        const res = await fetch(`/api/task-chat/${made.taskId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "" }),
        });
        const out = (await res.json()) as { ok: boolean; error?: string };
        // Already running or already finished is fine: the chat shows where it is.
        if (!out.ok && res.status !== 409) toast.error(out.error ?? "Could not start Claude.");
      } catch {
        toast.error("Could not reach the app.");
      }
      openChat(made.taskId);
    });
  }

  const isResolved = s.status !== "new";

  return (
    <li
      className={`glass-apple relative overflow-hidden rounded-xl p-4 transition-opacity ${
        isResolved ? "opacity-60" : ""
      }`}
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${typeTone[s.type]}`}
          >
            {typeLabel[s.type]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${priorityTone[s.priority]}`}
          >
            {s.priority}
          </span>
          {s.status === "applied" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="size-3" />
              Applied
            </span>
          )}
          {s.status === "dismissed" && (
            <span className="inline-flex rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
              Dismissed
            </span>
          )}
          {s.targetUrl && (
            <a
              href={s.targetUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
            >
              {s.targetUrl.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>

        {s.currentValue && (
          <div className="rounded-md border border-rose-500/15 bg-rose-500/[0.03] px-3 py-2 text-xs">
            <div className="font-medium text-rose-300/90">Current</div>
            <div className="mt-0.5 text-foreground/80 line-through decoration-rose-400/50">
              {s.currentValue}
            </div>
          </div>
        )}

        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 text-sm">
          <div className="text-[11px] font-medium text-emerald-300/90">
            Suggested
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-foreground/95">
            {s.suggestedValue}
          </div>
        </div>

        {s.rationale && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 size-3 shrink-0 text-violet-300" />
            <span>{s.rationale}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <AiFeedback
            feature="content_idea"
            aiOutput={s.suggestedValue}
            clientId={clientId}
            size="sm"
          />
          <AiDisclaimer variant="inline" />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copy}
            disabled={pending}
          >
            <Copy className="size-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
          {s.status === "new" && (
            <>
              <Button type="button" size="sm" onClick={doWithClaude} disabled={pending}>
                <Bot className="size-3.5" />
                Do it with Claude
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await suggestionToTask(s.id);
                  })
                }
                disabled={pending}
              >
                <ListChecks className="size-3.5" />
                Add to tasks
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await applySuggestion(s.id);
                  })
                }
                disabled={pending}
              >
                <CheckCircle2 className="size-3.5" />
                Mark applied
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await dismissSuggestion(s.id);
                  })
                }
                disabled={pending}
              >
                <X className="size-3.5" />
                Dismiss
              </Button>
            </>
          )}
          {(s.status === "applied" || s.status === "dismissed") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                startTransition(async () => {
                  await reopenSuggestion(s.id);
                })
              }
              disabled={pending}
            >
              <RotateCw className="size-3.5" />
              Reopen
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
