"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Edit3,
} from "lucide-react";
import { saveIssueNotes, toggleResolved } from "../actions";
import { AiDisclaimer } from "@/components/ai-disclaimer";

type IssueRow = {
  id: number;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  status: "new" | "resolved" | "ignored" | "false_positive";
  fixSteps: string | null;
  category: string | null;
  notes: string | null;
};

type AuditRow = {
  id: number;
  score: number | null;
  issuesCount: number;
  status: string;
  summary: string | null;
  targetUrl: string | null;
  createdAt: Date;
};

const SEV_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEV_TONE: Record<string, string> = {
  critical: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  high: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  medium: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  low: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
};

const CATEGORY_TONE: Record<string, string> = {
  technical: "bg-violet-500/10 text-violet-300",
  "on-page": "bg-cyan-500/10 text-cyan-300",
  content: "bg-emerald-500/10 text-emerald-300",
  schema: "bg-amber-500/10 text-amber-300",
  performance: "bg-rose-500/10 text-rose-300",
  mobile: "bg-violet-500/10 text-violet-300",
  social: "bg-cyan-500/10 text-cyan-300",
  eeat: "bg-emerald-500/10 text-emerald-300",
  security: "bg-rose-500/10 text-rose-300",
  accessibility: "bg-cyan-500/10 text-cyan-300",
};

export function ChecklistView({
  audit,
  issues,
}: {
  audit: AuditRow;
  issues: IssueRow[];
}) {
  // Group by category
  const grouped = useMemo(() => {
    const m = new Map<string, IssueRow[]>();
    for (const i of issues) {
      const k = i.category ?? "other";
      const cur = m.get(k) ?? [];
      cur.push(i);
      m.set(k, cur);
    }
    // Sort within each group by severity then status
    for (const [k, list] of m) {
      m.set(
        k,
        list.sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === "resolved" ? 1 : -1;
          }
          return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
        }),
      );
    }
    return m;
  }, [issues]);

  const total = issues.length;
  const resolved = issues.filter((i) => i.status === "resolved").length;
  const completionPct = total > 0 ? Math.round((resolved / total) * 100) : 0;

  function exportMarkdown() {
    const lines: string[] = [];
    lines.push(`# AI audit — ${audit.targetUrl ?? "(no URL)"}`);
    lines.push(`Score: ${audit.score ?? "—"}/100`);
    lines.push(`Date: ${audit.createdAt.toISOString().slice(0, 10)}`);
    lines.push(`Progress: ${resolved}/${total} resolved (${completionPct}%)`);
    lines.push("");
    if (audit.summary) {
      lines.push("## Executive summary");
      lines.push(audit.summary);
      lines.push("");
    }
    for (const [cat, list] of grouped) {
      lines.push(`## ${cat}`);
      for (const i of list) {
        const check = i.status === "resolved" ? "x" : " ";
        lines.push(`- [${check}] **${i.type}** (${i.severity}) — ${i.message}`);
        if (i.fixSteps) {
          lines.push("");
          lines.push(i.fixSteps);
          lines.push("");
        }
        if (i.notes) {
          lines.push(`> Note: ${i.notes}`);
          lines.push("");
        }
      }
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-audit-${audit.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyMarkdown() {
    const lines: string[] = [];
    lines.push(`# AI audit — ${audit.targetUrl ?? "(no URL)"}`);
    lines.push(`Score: ${audit.score ?? "—"}/100`);
    lines.push(`Progress: ${resolved}/${total} resolved`);
    lines.push("");
    if (audit.summary) {
      lines.push(audit.summary);
      lines.push("");
    }
    for (const [cat, list] of grouped) {
      lines.push(`## ${cat}`);
      for (const i of list) {
        const check = i.status === "resolved" ? "x" : " ";
        lines.push(`- [${check}] ${i.type} (${i.severity}) — ${i.message}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Score"
          value={`${audit.score ?? "—"}/100`}
          tone={
            audit.score === null
              ? undefined
              : audit.score >= 80
                ? "emerald"
                : audit.score >= 50
                  ? "amber"
                  : "rose"
          }
        />
        <Stat label="Total checks" value={total.toString()} />
        <Stat
          label="Resolved"
          value={`${resolved} / ${total}`}
          tone={completionPct === 100 ? "emerald" : "amber"}
          hint={`${completionPct}% done`}
        />
        <Stat label="Status" value={audit.status} />
      </div>

      {audit.summary && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold">Executive summary</h3>
          <p className="text-sm leading-relaxed">{audit.summary}</p>

          {/* Cite-or-bust: every claim in the summary maps to an issue
              in the checklist below. Surfacing the top-5 critical/high
              findings here lets the reader audit the summary against
              concrete evidence without scrolling. */}
          {(() => {
            const evidence = issues
              .filter(
                (i) =>
                  (i.severity === "critical" || i.severity === "high") &&
                  i.status === "new",
              )
              .slice(0, 5);
            if (evidence.length === 0) return null;
            return (
              <details className="rounded-md border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.04]">
                <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  Data behind this summary ({evidence.length})
                  <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    AI-generated — verify each
                  </span>
                </summary>
                <ul className="space-y-1.5 border-t border-white/[0.06] px-3 py-2 text-[12px]">
                  {evidence.map((e) => (
                    <li key={e.id} className="flex gap-2 leading-relaxed">
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${
                          SEV_TONE[e.severity] ?? ""
                        }`}
                      >
                        {e.severity}
                      </span>
                      <span className="text-foreground/90">
                        <span className="font-medium capitalize">
                          {e.type.replace(/_/g, " ")}
                        </span>
                        {": "}
                        <span className="text-muted-foreground">
                          {e.message}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })()}

          <AiDisclaimer />
        </section>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={exportMarkdown}
          className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
        >
          <Download className="mr-1.5 size-3" />
          Export markdown
        </button>
        <button
          type="button"
          onClick={copyMarkdown}
          className="inline-flex h-8 items-center rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
        >
          <Copy className="mr-1.5 size-3" />
          Copy markdown
        </button>
        <span className="text-[10px] text-muted-foreground">
          Resolved items can be included in client-facing reports.
        </span>
      </div>

      {Array.from(grouped.entries()).map(([cat, list]) => (
        <CategorySection key={cat} category={cat} list={list} />
      ))}
    </>
  );
}

function CategorySection({
  category,
  list,
}: {
  category: string;
  list: IssueRow[];
}) {
  const tone = CATEGORY_TONE[category] ?? "bg-white/5 text-muted-foreground";
  const total = list.length;
  const done = list.filter((i) => i.status === "resolved").length;
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider ${tone}`}
        >
          {category}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {done} / {total} resolved
        </span>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {list.map((i) => (
          <ChecklistItem key={i.id} issue={i} />
        ))}
      </ul>
    </section>
  );
}

function ChecklistItem({ issue }: { issue: IssueRow }) {
  const [resolved, setResolved] = useState(issue.status === "resolved");
  const [open, setOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(issue.notes ?? "");
  const [, startToggle] = useTransition();

  function toggle() {
    const next = !resolved;
    setResolved(next);
    startToggle(async () => {
      await toggleResolved(issue.id, next);
    });
  }

  function saveNote() {
    setEditingNote(false);
    startToggle(async () => {
      await saveIssueNotes(issue.id, note);
    });
  }

  return (
    <li className={`px-5 py-3 ${resolved ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={toggle}
          className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:text-emerald-300"
          aria-label={resolved ? "Mark not resolved" : "Mark resolved"}
        >
          {resolved ? (
            <CheckCircle2 className="size-5 text-emerald-300" />
          ) : (
            <Circle className="size-5" />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`font-medium ${resolved ? "line-through text-muted-foreground" : ""}`}
            >
              {issue.type}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wider ring-1 ring-inset ${SEV_TONE[issue.severity]}`}
            >
              {issue.severity}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{issue.message}</p>

          {issue.fixSteps && !resolved && (
            <div>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
              >
                {open ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
                {open ? "Hide fix steps" : "Show fix steps"}
              </button>
              {open && (
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-black/30 p-3 font-sans text-xs leading-relaxed">
                  {issue.fixSteps}
                </pre>
              )}
            </div>
          )}

          {/* Notes */}
          {!editingNote && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {note ? (
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
                  Note: {note}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setEditingNote(true)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Edit3 className="size-3" />
                {note ? "Edit note" : "Add note"}
              </button>
            </div>
          )}
          {editingNote && (
            <div className="flex items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. waiting on dev to deploy fix"
                className="h-7 w-full rounded-md border border-white/10 bg-card/60 px-2 text-xs"
              />
              <button
                type="button"
                onClick={saveNote}
                className="inline-flex h-7 items-center rounded-md bg-emerald-500/15 px-2 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
              >
                <Check className="mr-1 size-3" />
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber" | "rose";
}) {
  const t = tone
    ? { emerald: "text-emerald-300", amber: "text-amber-300", rose: "text-rose-300" }[tone]
    : "";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
