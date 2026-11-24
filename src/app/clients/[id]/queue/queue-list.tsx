"use client";

import type { Tx } from "@/lib/tx";
import { useTranslations, useLocale } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  MessageSquareText,
  Save,
  Send,
  Share2,
  ThumbsDown,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  approveAndPublishNow,
  approveQueueItem,
  deleteQueueItem,
  exportBlogMarkdown,
  rejectQueueItem,
  sendQueueItemToClient,
} from "./actions";
import type { PublishQueueItem } from "@/db/schema";
import { htmlToMarkdown, slugify } from "@/lib/blog-export";

type Kind = PublishQueueItem["kind"];
type Status = PublishQueueItem["status"];

const KIND_ICON: Record<Kind, typeof FileText> = {
  blog_draft: FileText,
  gbp_post: Globe,
  social_post: Share2,
  internal_checklist: Megaphone,
};

const KIND_LABEL = (tx: Tx): Record<Kind, string> => ({
  blog_draft: tx("blogDraft"),
  gbp_post: tx("gbpPost"),
  social_post: tx("socialPost"),
  internal_checklist: tx("dailyChecklist"),
});

const STATUS_STYLE = (tx: Tx): Record<
  Status,
  { label: string; cls: string }
> => ({
  pending_review: {
    label: tx("pending"),
    cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  approved: {
    label: tx("approved"),
    cls: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  published: {
    label: tx("published"),
    cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  skipped: {
    label: tx("skipped"),
    cls: "bg-white/5 text-muted-foreground ring-white/10",
  },
  failed: {
    label: tx("failed"),
    cls: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
});

type Filter = "pending" | "all" | "published" | "failed";

export function QueueList({
  items,
  clientId,
}: {
  items: PublishQueueItem[];
  clientId: number;
}) {
  const tx = useTranslations("ui.app_clients_id_queue_queue-list");
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
          <h3 className="mt-4 text-base font-semibold">{tx("nothingWaitingYet")}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {tx.rich("theQueueCollectsAiGenerated", { b0: (chunks) => <span className="font-medium text-foreground/80">{chunks}</span> })}
          </p>
          <p className="mt-4 grid w-full max-w-xs grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
              {tx.rich("pendingWaitsForYou", { b0: (chunks) => <span className="font-semibold">{chunks}</span> })}
            </span>
            <span className="rounded-md bg-emerald-500/10 px-2 py-1.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              {tx.rich("autoPublishSkipsReview", { b0: (chunks) => <span className="font-semibold">{chunks}</span> })}
            </span>
          </p>
          <a
            href={`/clients/${clientId}/automations`}
            className="mt-5 inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25"
          >
            {tx("setUpASchedule")}
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
            {f === "pending"
              ? tx("needsReview")
              : f === "all"
                ? tx("filterAll")
                : f === "published"
                  ? tx("published")
                  : tx("failed")}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {filtered.map((item) => (
          <QueueRow key={item.id} item={item} clientId={clientId} />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-2xl border border-white/5 bg-card/40 px-5 py-8 text-center text-sm text-muted-foreground">
            {tx("nothingMatchesThisFilter")}
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
  const tx = useTranslations("ui.app_clients_id_queue_queue-list");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title ?? "");
  const [draftBody, setDraftBody] = useState(item.body ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const Icon = KIND_ICON[item.kind];
  const style = STATUS_STYLE(tx)[item.status];

  const canEdit =
    item.status === "pending_review" || item.status === "approved";
  const canApprove = item.status === "pending_review";

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

  function sendToClient() {
    startTransition(async () => {
      const edits =
        editing && (draftTitle !== item.title || draftBody !== item.body)
          ? { title: draftTitle, body: draftBody }
          : undefined;
      const r = await sendQueueItemToClient(item.id, clientId, edits);
      if (r.ok) {
        toast.success(r.message);
        setEditing(false);
      } else if (r.needsPortalLink) {
        toast.error(r.message, {
          action: {
            label: tx("createPortalLink"),
            onClick: () => router.push(`/clients/${clientId}?tab=settings`),
          },
        });
      } else {
        toast.error(r.message);
      }
    });
  }

  function reject() {
    startTransition(async () => {
      await rejectQueueItem(item.id, clientId);
      toast.success(tx("rejectedWonTBePublished"));
    });
  }

  async function destroy() {
    const ok = await confirmDialog({
      title: tx("deleteThisQueueItem"),
      description: tx("itSRemovedPermanentlyThe"),
      confirmLabel: tx("delete"),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      await deleteQueueItem(item.id, clientId);
      toast.success(tx("deleted"));
    });
  }

  function copyBody() {
    navigator.clipboard.writeText(item.body ?? "").then(() => {
      toast.success(tx("copiedBody"));
    });
  }

  function copyAsMarkdown() {
    const title = item.title ? `# ${item.title}\n\n` : "";
    navigator.clipboard
      .writeText(title + htmlToMarkdown(item.body ?? ""))
      .then(() => toast.success(tx("copiedMarkdown")));
  }

  function saveFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tx("downloaded", { download: filename }));
  }

  function downloadMarkdown(forAi: boolean) {
    startTransition(async () => {
      const r = await exportBlogMarkdown(item.id, clientId, forAi);
      if (r.ok) saveFile(r.filename, r.content, "text/markdown");
      else toast.error(r.message || tx("exportFailed"));
    });
  }

  function downloadHtml() {
    const filename = slugify(item.title ?? "") || "draft";
    const content = `<!doctype html><meta charset="utf-8"><title>${item.title ?? ""}</title>\n${item.title ? `<h1>${item.title}</h1>\n` : ""}${item.body ?? ""}`;
    saveFile(`${filename}.html`, content, "text/html");
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
              {item.title || tx("untitled")}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${style.cls}`}
            >
              {style.label}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {KIND_LABEL(tx)[item.kind]} ·{" "}
            <Clock className="inline size-3 -mt-0.5" />{" "}
            {new Date(item.generatedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
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
                    {tx("view")} <ExternalLink className="size-3" />
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

      <ClientDecision item={item} />

      {open && (
        <div className="space-y-3 px-5 py-4">
          {editing ? (
            <>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">{tx("title")}</span>
                <input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">{tx("body")}</span>
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
              {item.body || tx("empty")}
            </pre>
          )}

          <div className="flex flex-wrap items-center gap-2">
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
                  {tx("approvePublishNow")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => approve(false)}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
                >
                  <CheckCircle2 className="mr-1.5 size-3" />
                  {tx("approvePublishOnNextTick")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={reject}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                >
                  <ThumbsDown className="mr-1.5 size-3" />
                  {tx("reject")}
                </button>
                {item.kind !== "internal_checklist" && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={sendToClient}
                  className="inline-flex h-9 items-center rounded-md bg-sky-500/15 px-3 text-xs font-medium text-sky-300 ring-1 ring-inset ring-sky-500/30 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  <UserCheck className="mr-1.5 size-3" />
                  {item.clientSharedAt ? tx("sendAgainToClient") : tx("sendToClient")}
                </button>
                )}
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
                    {tx("cancelEdit")}
                  </>
                ) : (
                  <>
                    <Edit3 className="mr-1.5 size-3" />
                    {tx("editBeforeApproving")}
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={copyBody}
              className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
              title={tx("copyRawBodyToClipboard")}
            >
              <Copy className="mr-1.5 size-3" />
              {tx("copy")}
            </button>
            {item.kind === "blog_draft" && (
              <>
                <button
                  type="button"
                  onClick={copyAsMarkdown}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title={tx("copyAsMarkdownPasteInto")}
                >
                  <FileCode className="mr-1.5 size-3" />
                  {tx("copyMd")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => downloadMarkdown(false)}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title={tx("downloadAsMdFile")}
                >
                  <Download className="mr-1.5 size-3" />
                  .md
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => downloadMarkdown(true)}
                  className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-3 text-xs text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
                  title={tx("downloadMdForAiTitle")}
                >
                  <Download className="mr-1.5 size-3" />
                  {tx("downloadMdForAi")}
                </button>
                <button
                  type="button"
                  onClick={downloadHtml}
                  className="inline-flex h-9 items-center rounded-md bg-white/5 px-3 text-xs ring-1 ring-inset ring-white/10 hover:bg-white/10"
                  title={tx("downloadAsHtmlFile")}
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
              title={tx("delete")}
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>

          {editing && (
            <p className="rounded-md bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-200 ring-1 ring-inset ring-cyan-500/30">
              <Save className="inline size-3 -mt-0.5" /> {tx("yourEditsAreSavedWhen")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Where the item stands with the client: sent and waiting, approved, or
 * changes asked (with the client's comment). Only while the agency has
 * not settled the item itself.
 */
function ClientDecision({ item }: { item: PublishQueueItem }) {
  const tx = useTranslations("ui.app_clients_id_queue_queue-list");
  const locale = useLocale();
  if (!item.clientSharedAt) return null;
  const when = (d: Date) =>
    new Date(d).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });

  if (item.clientDecision === "approved" && item.clientDecidedAt) {
    return (
      <div className="flex items-start gap-2 border-b border-white/[0.06] bg-emerald-500/[0.05] px-5 py-2 text-[11px] text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
        <span>{tx("clientApprovedOn", { date: when(item.clientDecidedAt) })}</span>
      </div>
    );
  }
  if (item.clientDecision === "changes" && item.clientDecidedAt) {
    return (
      <div className="space-y-1.5 border-b border-white/[0.06] bg-amber-500/[0.05] px-5 py-2.5 text-[11px] text-amber-300">
        <div className="flex items-start gap-2">
          <MessageSquareText className="mt-0.5 size-3 shrink-0" />
          <span>{tx("clientAskedChangesOn", { date: when(item.clientDecidedAt) })}</span>
        </div>
        {item.clientComment && (
          <blockquote className="ml-5 whitespace-pre-line break-words border-l-2 border-amber-500/40 pl-3 text-xs text-foreground/90">
            {item.clientComment}
          </blockquote>
        )}
        {item.status === "pending_review" && (
          <p className="ml-5 text-muted-foreground">{tx("changesHint")}</p>
        )}
      </div>
    );
  }
  if (item.status !== "pending_review") return null;
  return (
    <div className="flex items-start gap-2 border-b border-white/[0.06] bg-sky-500/[0.05] px-5 py-2 text-[11px] text-sky-300">
      <UserCheck className="mt-0.5 size-3 shrink-0" />
      <span>{tx("sentToClientOn", { date: when(item.clientSharedAt) })}</span>
    </div>
  );
}
