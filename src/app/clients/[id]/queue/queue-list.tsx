"use client";

import { useMemo, useState, useTransition } from "react";
import { openChat } from "@/components/claude/dock-store";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileCode,
  FileText,
  Globe,
  Inbox,
  Loader2,
  Megaphone,
  Sparkles,
  Save,
  Send,
  Share2,
  ThumbsDown,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  approveAndPublishNow,
  approveQueueItem,
  deleteQueueItem,
  rejectQueueItem,
} from "./actions";
import type { PublishQueueItem } from "@/db/schema";
import { buildBlogMarkdown, htmlToMarkdown, slugify } from "@/lib/blog-export";

type Kind = PublishQueueItem["kind"];
type Status = PublishQueueItem["status"];

const KIND_ICON: Record<Kind, typeof FileText> = {
  blog_draft: FileText,
  gbp_post: Globe,
  social_post: Share2,
  internal_checklist: Megaphone,
};

const KIND_LABEL: Record<Kind, string> = {
  blog_draft: "Blog draft",
  gbp_post: "GBP post",
  social_post: "Social post",
  internal_checklist: "Daily checklist",
};

const STATUS_STYLE: Record<
  Status,
  { label: string; cls: string }
> = {
  pending_review: {
    label: "Pending",
    cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  approved: {
    label: "Approved",
    cls: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  published: {
    label: "Published",
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  skipped: {
    label: "Skipped",
    cls: "bg-white/5 text-muted-foreground ring-white/10",
  },
  failed: {
    label: "Failed",
    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
};

type Filter = "pending" | "all" | "published" | "failed";

export function QueueList({
  items,
  clientId,
}: {
  items: PublishQueueItem[];
  clientId: number;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "pending") {
      return items.filter(
        (i) => i.status === "pending_review" || i.status === "approved",
      );
    }
    if (filter === "published") {
      return items.filter((i) => i.status === "published");
    }
    if (filter === "failed") {
      return items.filter((i) => i.status === "failed");
    }
    return items;
  }, [items, filter]);

  if (items.length === 0) {
    return (
      <div className="glass-apple rounded-2xl px-6 py-12">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/15 ring-1 ring-inset ring-violet-500/30">
            <Inbox className="size-5 text-violet-300" />
          </span>
          <h3 className="mt-4 text-base font-semibold">Nothing waiting yet</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The queue collects AI-generated items from your daily schedules
            (blog drafts, GBP posts, social copy, daily checklists). Schedules
            run once a day at the time you set — items land here in{" "}
            <span className="font-medium text-foreground/80">
              Pending review
            </span>{" "}
            for you to approve, edit, or reject.
          </p>
          <p className="mt-4 grid w-full max-w-xs grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <span className="font-semibold">Pending</span> · waits for you
            </span>
            <span className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <span className="font-semibold">Auto-publish</span> · skips review
            </span>
          </p>
          <a
            href={`/clients/${clientId}/automations`}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25"
          >
            Set up a schedule →
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {(["pending", "all", "published", "failed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1 text-xs ring-1 ring-inset transition-colors ${
              filter === f
                ? "bg-white/10 text-foreground ring-white/20"
                : "bg-white/[0.02] text-muted-foreground ring-white/5 hover:bg-white/5"
            }`}
          >
            {f === "pending" ? "Needs review" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {filtered.map((item) => (
          <QueueRow key={item.id} item={item} clientId={clientId} />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-white/5 bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing matches this filter.
          </li>
        )}
      </ul>
    </>
  );
}

function QueueRow({
  item,
  clientId,
}: {
  item: PublishQueueItem;
  clientId: number;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title ?? "");
  const [draftBody, setDraftBody] = useState(item.body ?? "");
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState(false);

  const Icon = KIND_ICON[item.kind];
  const style = STATUS_STYLE[item.status];

  const canEdit =
    item.status === "pending_review" || item.status === "approved";
  const canApprove = item.status === "pending_review";
  // A failed item used to be a dead end — only Copy / .md were offered.
  const canRetry = item.status === "failed";
  const canPublishNow = item.status === "approved";

  function approve(publishNow: boolean) {
    startTransition(async () => {
      const edits =
        editing && (draftTitle !== item.title || draftBody !== item.body)
          ? { title: draftTitle, body: draftBody }
          : undefined;
      const action = publishNow ? approveAndPublishNow : approveQueueItem;
      const r = await action(item.id, clientId, edits);
      if (r.ok) {
        toast.success(r.message);
        setEditing(false);
      } else {
        toast.error(r.message);
      }
    });
  }

  function reject() {
    startTransition(async () => {
      await rejectQueueItem(item.id, clientId);
      toast.success("Rejected — won't be published.");
    });
  }

  async function destroy() {
    const ok = await confirmDialog({
      title: "Delete this queue item?",
      description: "It's removed permanently. The schedule will generate a fresh item on its next run.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteQueueItem(item.id, clientId);
      toast.success("Deleted.");
    });
  }

  function copyBody() {
    navigator.clipboard.writeText(item.body ?? "").then(() => {
      toast.success("Copied body to clipboard.");
    });
  }

  async function openInClaude() {
    setOpening(true);
    try {
      const res = await fetch("/api/blog-in-claude", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const out = (await res.json()) as { ok: boolean; taskId?: number; error?: string };
      if (!out.ok || !out.taskId) {
        toast.error(out.error ?? "Could not open Claude.");
        return;
      }
      openChat(out.taskId);
    } catch {
      toast.error("Could not open Claude.");
    } finally {
      setOpening(false);
    }
  }

  function copyAsMarkdown() {
    const title = item.title ? `# ${item.title}\n\n` : "";
    navigator.clipboard
      .writeText(title + htmlToMarkdown(item.body ?? ""))
      .then(() => toast.success("Copied as Markdown."));
  }

  function downloadAs(format: "md" | "md-ai" | "html") {
    const filename = slugify(item.title ?? "draft");
    let content: string;
    let mime: string;
    let ext: string;
    if (format === "md" || format === "md-ai") {
      content = buildBlogMarkdown(
        {
          title: item.title,
          body: item.body,
          payload: item.payloadJson,
          date: item.generatedAt,
        },
        { forAi: format === "md-ai" },
      );
      mime = "text/markdown";
      ext = "md";
    } else {
      content = `<!doctype html><meta charset="utf-8"><title>${item.title ?? ""}</title>
${item.title ? `<h1>${item.title}</h1>
` : ""}${item.body ?? ""}`;
      mime = "text/html";
      ext = "html";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename || "draft"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${a.download}`);
  }

  return (
    <li
      className={`glass-apple relative overflow-hidden rounded-2xl ${
        item.status === "failed" ? "ring-1 ring-inset ring-rose-500/30" : ""
      }`}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-5 py-3">
        <Icon className="size-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold truncate">
              {item.title || "(untitled)"}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${style.cls}`}
            >
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {KIND_LABEL[item.kind]} ·{" "}
            <Clock className="inline size-3 -mt-0.5" />{" "}
            {new Date(item.generatedAt).toLocaleString().slice(0, 16)}
            {item.publishedRef && item.status === "published" && (
              <>
                {" · "}
                {item.publishedRef.startsWith("http") ? (
                  <a
                    href={item.publishedRef}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                  >
                    view <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">
                    {item.publishedRef.slice(0, 60)}
                  </code>
                )}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/5"
        >
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </header>

      {item.status === "failed" && item.errorMsg && (
        <div className="flex items-start gap-2 border-b border-white/[0.06] bg-rose-500/[0.04] px-5 py-2 text-[11px] text-rose-300">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{item.errorMsg}</span>
        </div>
      )}

      {open && (
        <div className="space-y-3 px-5 py-4">
          {editing ? (
            <>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Title</span>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">Body</span>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={item.kind === "blog_draft" ? 20 : 8}
                  className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm font-mono focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
            </>
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/90 ring-1 ring-inset ring-white/5">
              {item.body || "(empty)"}
            </pre>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {(canRetry || canPublishNow) && (
              <button
                type="button"
                disabled={pending}
                onClick={() => approve(true)}
                className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                ) : (
                  <Send className="mr-2 size-3" />
                )}
                {canRetry ? "Retry publish" : "Publish now"}
              </button>
            )}
            {canApprove && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => approve(true)}
                  className="inline-flex h-9 items-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="mr-2 size-3 animate-spin" />
                  ) : (
                    <Send className="mr-2 size-3" />
                  )}
                  Approve + publish now
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => approve(false)}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
                >
                  <CheckCircle2 className="mr-1.5 size-3" />
                  Approve (publish on next tick)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={reject}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                >
                  <ThumbsDown className="mr-1.5 size-3" />
                  Reject
                </button>
              </>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setDraftTitle(item.title ?? "");
                    setDraftBody(item.body ?? "");
                  }
                  setEditing(!editing);
                }}
                className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
              >
                {editing ? (
                  <>
                    <X className="mr-1.5 size-3" />
                    Cancel edit
                  </>
                ) : (
                  <>
                    <Edit3 className="mr-1.5 size-3" />
                    Edit before approving
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={copyBody}
              className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
              title="Copy raw body to clipboard"
            >
              <Copy className="mr-1.5 size-3" />
              Copy
            </button>
            {item.kind === "blog_draft" && (
              <>
                <button
                  type="button"
                  onClick={copyAsMarkdown}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title="Copy as Markdown (paste into Notion, Medium, ghost editor)"
                >
                  <FileCode className="mr-1.5 size-3" />
                  Copy MD
                </button>
                <button
                  type="button"
                  onClick={() => downloadAs("md")}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title="Download as .md file"
                >
                  <Download className="mr-1.5 size-3" />
                  .md
                </button>
                <button
                  type="button"
                  onClick={() => downloadAs("md-ai")}
                  className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-3 text-xs text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
                  title="Markdown with frontmatter (title, description, slug, keywords) and a brief telling an AI how to enrich the article — for Astro, Next.js and other static sites"
                >
                  <Download className="mr-1.5 size-3" />
                  .md for AI
                </button>
                <button
                  type="button"
                  disabled={opening}
                  onClick={openInClaude}
                  className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-3 text-xs text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-60"
                  title="Open a Claude chat in the client's project folder with this draft attached"
                >
                  {opening ? (
                    <Loader2 className="mr-1.5 size-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 size-3" />
                  )}
                  Open in Claude
                </button>
                <button
                  type="button"
                  onClick={() => downloadAs("html")}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title="Download as .html file"
                >
                  <Download className="mr-1.5 size-3" />
                  .html
                </button>
              </>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={destroy}
              className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          {editing && (
            <p className="rounded-md bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-200 ring-1 ring-inset ring-cyan-500/30">
              <Save className="inline size-3 -mt-0.5" /> Your edits are saved
              when you click an Approve button below.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
