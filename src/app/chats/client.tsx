"use client";

import { useTranslations, useLocale } from "next-intl";
import type { Tx } from "@/lib/tx";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Filter,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  User,
} from "lucide-react";
import {
  clearChats,
  deleteChat,
  fetchChat,
  pinChat,
  renameChat,
} from "./actions";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import type {
  ChatConversation,
  ChatMessage,
} from "@/db/schema";

const KIND_LABEL = (tx: Tx): Record<string, string> => ({
  assistant: tx("assistant"),
  seo_chat: tx("seoChat"),
  ask_tool: tx("askTheTool"),
  portal_chat: tx("portalChat"),
});

const KIND_TONE: Record<string, string> = {
  assistant: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  seo_chat: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  ask_tool: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  portal_chat: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

export function ChatsClient({
  conversations,
  currentKind,
}: {
  conversations: ChatConversation[];
  currentKind: string;
}) {
  const tx = useTranslations("ui.app_chats_client");
  const [pending, startTransition] = useTransition();

  return (
    <>
      <section className="rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="size-3 text-muted-foreground" />
          <Link
            href="/chats"
            className={pillClass(currentKind === "all")}
          >
            {tx("all", { length: conversations.length })}
          </Link>
          {(["assistant", "seo_chat", "ask_tool", "portal_chat"] as const).map((k) => {
            const n = conversations.filter((c) => c.kind === k).length;
            if (n === 0 && currentKind !== k) return null;
            return (
              <Link
                key={k}
                href={`/chats?kind=${k}`}
                className={pillClass(currentKind === k)}
              >
                {KIND_LABEL(tx)[k]} ({n})
              </Link>
            );
          })}
          {conversations.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                const scope =
                  currentKind === "all"
                    ? tx("allConversations")
                    : tx("conversations", { v: KIND_LABEL(tx)[currentKind] ?? currentKind });
                const ok = await confirmDialog({
                  title: tx("clearUnpinned2", { scope }),
                  description: tx("pinnedChatsArePreservedThis"),
                  confirmLabel: tx("clearUnpinned"),
                  destructive: true,
                });
                if (!ok) return;
                startTransition(async () => {
                  await clearChats(
                    currentKind === "all"
                      ? undefined
                      : (currentKind as Parameters<typeof clearChats>[0]),
                  );
                });
              }}
              className="ml-auto text-[11px] text-rose-300 hover:underline disabled:opacity-50"
            >
              {tx("clearUnpinned")}
            </button>
          )}
        </div>
      </section>

      {conversations.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          {tx("noSavedChatsYetUse")}
        </p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <ConvRow key={c.id} conv={c} />
          ))}
        </ul>
      )}
    </>
  );
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}

function ConvRow({ conv }: { conv: ChatConversation }) {
  const tx = useTranslations("ui.app_chats_client");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pending, startTransition] = useTransition();

  async function loadMessages() {
    if (messages !== null) return;
    setLoadingMessages(true);
    const r = await fetchChat(conv.id);
    setMessages(r?.messages ?? []);
    setLoadingMessages(false);
  }

  return (
    <li className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center gap-3 px-5 py-3 text-sm">
        {conv.pinned && <Pin className="size-3 shrink-0 text-amber-300" />}
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${KIND_TONE[conv.kind]}`}
        >
          {KIND_LABEL(tx)[conv.kind] ?? conv.kind}
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              action={async (fd) => {
                await renameChat(conv.id, fd);
                setRenaming(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                name="title"
                defaultValue={conv.title}
                className="h-7 flex-1 rounded-md border border-white/10 bg-card/60 px-2 text-xs"
                autoFocus
              />
              <button
                type="submit"
                className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30"
              >
                {tx("save")}
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                {tx("cancel")}
              </button>
            </form>
          ) : (
            <p className="truncate font-medium">{conv.title}</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {new Date(conv.updatedAt).toLocaleString(locale)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            if (!open) loadMessages();
          }}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/10"
          title={tx("viewTranscript")}
        >
          {open ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setRenaming((r) => !r)}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/10"
          title={tx("rename")}
        >
          <Pencil className="size-3" />
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await pinChat(conv.id);
            });
          }}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-50"
          title={conv.pinned ? tx("unpin") : tx("pin")}
        >
          {conv.pinned ? (
            <PinOff className="size-3.5" />
          ) : (
            <Pin className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirmDialog({
              title: tx("deleteThisConversation"),
              description: tx("theTranscriptIsRemovedPermanently"),
              confirmLabel: "Delete",
              destructive: true,
            });
            if (!ok) return;
            startTransition(async () => {
              await deleteChat(conv.id);
            });
          }}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-50"
          title={tx("delete")}
        >
          <Trash2 className="size-3.5" />
        </button>
      </header>

      {open && (
        <div className="space-y-3 border-t border-white/[0.06] bg-black/20 px-5 py-4 text-[13px]">
          {loadingMessages ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {tx("loadingTranscript")}
            </p>
          ) : (messages ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">{tx("noMessages")}</p>
          ) : (
            (messages ?? []).map((m) => (
              <div key={m.id} className="flex gap-3">
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
                    m.role === "user"
                      ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
                      : "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                  }`}
                >
                  {m.role === "user" ? (
                    <User className="size-3.5" />
                  ) : (
                    <Bot className="size-3.5" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  {m.imageDataUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={m.imageDataUrl}
                      alt={tx("upload")}
                      className="max-h-40 rounded-lg ring-1 ring-inset ring-white/10"
                    />
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {m.content}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </li>
  );
}
