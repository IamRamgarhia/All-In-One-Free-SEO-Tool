"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ExternalLink, History, Maximize2, Minimize2, Minus, X } from "lucide-react";
import {
  closeTab,
  getServerSnapshot,
  getSnapshot,
  openChat,
  selectTab,
  setDockOpen,
  subscribe,
  toggleLarge,
} from "./dock-store";
import { TerminalChat } from "./terminal-chat";

type Chat = {
  taskId: number;
  title: string;
  client: string | null;
  folder: string | null;
  ready: boolean;
  status: "idle" | "running" | "error";
  updatedAt: number;
};

function Dot({ status }: { status: Chat["status"] | undefined }) {
  if (status === "running") {
    return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-[#d97757]" />;
  }
  if (status === "error") return <span className="size-1.5 shrink-0 rounded-full bg-rose-400" />;
  return <span className="size-1.5 shrink-0 rounded-full bg-zinc-600" />;
}

/**
 * Claude, in the corner of every page. A pill that opens a terminal-style
 * window; chats stay open across pages and reloads (see dock-store), and
 * keep running on the server whether or not the window is showing.
 */
export function ClaudeDock() {
  const dock = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [chats, setChats] = useState<Chat[]>([]);
  const [allowed, setAllowed] = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);

  const tabKey = dock.tabs.join(",");
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/task-chat?ids=${tabKey}`);
        // Not the owner, or not on this machine: Claude is not offered at all.
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          if (live) setAllowed(false);
          return;
        }
        const j = (await res.json()) as { ok: boolean; chats?: Chat[] };
        if (live && j.ok && j.chats) {
          setChats(j.chats);
          setAllowed(true);
        }
      } catch {
        // offline for a moment: keep what is on screen
      }
    };
    void load();
    const t = setInterval(load, dock.open ? 3000 : 6000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [tabKey, dock.open]);

  if (!allowed) return null;

  const byId = new Map(chats.map((c) => [c.taskId, c]));
  const running = chats.filter((c) => c.status === "running").length;
  const active = dock.active != null ? byId.get(dock.active) : undefined;
  const recent = chats.filter((c) => !dock.tabs.includes(c.taskId));

  return (
    <>
      {/* Launcher: always there, so a chat is never lost by navigating away. */}
      <button
        type="button"
        onClick={() => {
          if (dock.open) setDockOpen(false);
          else if (dock.active != null) setDockOpen(true);
          else if (chats[0]) openChat(chats[0].taskId);
          else setDockOpen(true);
        }}
        aria-label="Claude chats"
        title="Claude chats"
        className="fixed bottom-5 right-36 z-40 flex h-12 items-center gap-2 rounded-full border border-white/10 bg-[#0c0c0e] px-4 font-mono text-xs text-zinc-200 shadow-xl shadow-black/40 transition-transform hover:scale-105"
      >
        <span className="text-[15px] text-[#d97757]">✻</span>
        Claude
        {running > 0 ? (
          <span className="flex items-center gap-1 text-[#d97757]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#d97757]" />
            {running}
          </span>
        ) : dock.tabs.length > 0 ? (
          <span className="text-zinc-500">{dock.tabs.length}</span>
        ) : null}
      </button>

      {dock.open && (
        <div
          className={`fixed bottom-[5.25rem] right-5 z-40 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] shadow-2xl shadow-black/60 ${
            dock.large
              ? "h-[calc(100vh-7.5rem)] w-[min(960px,calc(100vw-2.5rem))]"
              : "h-[min(620px,calc(100vh-7.5rem))] w-[min(520px,calc(100vw-2.5rem))]"
          }`}
        >
          {/* Title bar */}
          <div className="flex shrink-0 items-center gap-1 border-b border-white/10 bg-[#111114] px-3 py-1.5 font-mono text-[11px] text-zinc-400">
            <span className="text-[#d97757]">✻</span>
            <span className="font-semibold text-zinc-200">Claude Code</span>
            {active?.client && <span className="truncate text-zinc-600">· {active.client}</span>}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setRecentOpen((v) => !v)}
              title="Recent chats"
              className={`rounded p-1 hover:bg-white/10 ${recentOpen ? "bg-white/10 text-zinc-100" : ""}`}
            >
              <History className="size-3.5" />
            </button>
            {dock.active != null && (
              <a
                href={`/tasks/${dock.active}/chat`}
                title="Open as a full page"
                className="rounded p-1 hover:bg-white/10"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={toggleLarge}
              title={dock.large ? "Smaller" : "Larger"}
              className="rounded p-1 hover:bg-white/10"
            >
              {dock.large ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setDockOpen(false)}
              title="Minimize (chats keep running)"
              className="rounded p-1 hover:bg-white/10"
            >
              <Minus className="size-3.5" />
            </button>
          </div>

          {/* Tabs */}
          {dock.tabs.length > 0 && (
            <div className="flex shrink-0 gap-px overflow-x-auto border-b border-white/10 bg-[#0e0e11] font-mono text-[11px]">
              {dock.tabs.map((id) => {
                const c = byId.get(id);
                const isActive = id === dock.active;
                return (
                  <div
                    key={id}
                    className={`group flex max-w-[11rem] shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 ${
                      isActive
                        ? "border-[#d97757] bg-[#0c0c0e] text-zinc-100"
                        : "border-transparent text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectTab(id)}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      <Dot status={c?.status} />
                      <span className="truncate">{c?.title ?? `Task #${id}`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => closeTab(id)}
                      title="Close this chat (it keeps its history)"
                      className="rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent chats */}
          {recentOpen && (
            <div className="max-h-48 shrink-0 overflow-y-auto border-b border-white/10 bg-[#0e0e11] font-mono text-[11px]">
              {recent.length === 0 ? (
                <p className="px-3 py-2 text-zinc-500">No other chats yet.</p>
              ) : (
                recent.map((c) => (
                  <button
                    key={c.taskId}
                    type="button"
                    onClick={() => {
                      openChat(c.taskId);
                      setRecentOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-300 hover:bg-white/5"
                  >
                    <Dot status={c.status} />
                    <span className="truncate">{c.title}</span>
                    {c.client && <span className="shrink-0 text-zinc-600">{c.client}</span>}
                  </button>
                ))
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
            {dock.active != null ? (
              <TerminalChat
                key={dock.active}
                taskId={dock.active}
                ready={active ? active.ready : true}
                folder={active?.folder}
                title={active?.title}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs text-zinc-500">
                No chat open. Press &quot;Claude chat&quot; on a task, or pick one from the clock icon.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
