"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { addAnnotation, removeAnnotation, type CreateState } from "./actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type { Annotation } from "@/db/schema";
import {
  KIND_COLOR,
  KIND_LABEL,
  type AnnotationKind,
} from "@/lib/annotations-constants";

const KIND_TONE: Record<AnnotationKind, string> = {
  algo: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  content: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  technical: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  outreach: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  custom: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

export function AnnotationsClient({
  clients,
  annotations,
}: {
  clients: { id: number; name: string }[];
  annotations: Annotation[];
}) {
  const [state, formAction, pending] = useActionState<CreateState, FormData>(
    addAnnotation,
    null,
  );
  const [scope, setScope] = useState<string>("global");
  const [pendingDel, startDel] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px_140px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Label *</span>
            <input
              name="label"
              required
              placeholder="Google March 2026 core update"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Event date *</span>
            <input
              name="eventDate"
              required
              type="date"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Kind</span>
            <select
              name="kind"
              defaultValue="custom"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="algo">Algorithm update</option>
              <option value="content">Content event</option>
              <option value="technical">Technical change</option>
              <option value="outreach">Outreach milestone</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>

        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Description (optional)</span>
          <textarea
            name="description"
            rows={2}
            placeholder="Rolled out March 15-20. Affects helpful-content signals."
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-[140px_1fr]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Scope</span>
            <select
              name="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="global">Global (all charts)</option>
              <option value="client">Single client</option>
              <option value="keyword">Single keyword</option>
              <option value="page">Single page URL</option>
            </select>
          </label>
          {scope === "client" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Client</span>
              <select
                name="clientId"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {scope === "keyword" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Keyword ID</span>
              <input
                name="keywordId"
                type="number"
                placeholder="123 (find in /keywords URL)"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              />
            </label>
          )}
          {scope === "page" && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Page URL</span>
              <input
                name="pageUrl"
                placeholder="https://yoursite.com/blog/post"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              />
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="mr-2 size-4" />
              Add annotation
            </>
          )}
        </button>
        {state && !state.ok && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {state.error}
          </p>
        )}
      </form>

      {annotations.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No annotations yet. Add one above — they&apos;ll overlay on rank,
          traffic, and CWV charts wherever the scope matches.
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {annotations.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${KIND_TONE[a.kind as AnnotationKind]}`}
              >
                {KIND_LABEL[a.kind as AnnotationKind]}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{a.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {a.eventDate.toLocaleDateString()} · scope: {a.scope}
                  {a.clientId &&
                    clients.find((c) => c.id === a.clientId) &&
                    ` · ${clients.find((c) => c.id === a.clientId)?.name}`}
                  {a.pageUrl && ` · ${a.pageUrl.replace(/^https?:\/\//, "").slice(0, 50)}`}
                </p>
                {a.description && (
                  <p className="text-[11px] text-muted-foreground/80">
                    {a.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={pendingDel}
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: "Delete this annotation?",
                    description:
                      "It will no longer appear on traffic / rank charts.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (!ok) return;
                  startDel(async () => {
                    await removeAnnotation(a.id);
                  });
                }}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Reference suppressor for KIND_COLOR */}
      <span className="sr-only">{Object.keys(KIND_COLOR).join(",")}</span>
    </div>
  );
}
