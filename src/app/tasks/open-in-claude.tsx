"use client";

import { useState } from "react";
import { openChat } from "@/components/claude/dock-store";
import { Loader2, MessagesSquare, Terminal } from "lucide-react";

/**
 * Hands one task to Claude Code in the client's project folder, two ways:
 * the chat page (saved conversation, in the browser) or a terminal window.
 * See /api/open-in-claude: it opens a terminal on this machine when it
 * can, and otherwise copies the command to run by hand.
 */
export function OpenInClaude({ taskId }: { taskId: number }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);

  async function open() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/open-in-claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        launched?: boolean;
        command?: string;
        error?: string;
      };
      if (!data.ok) {
        setNote({ text: data.error ?? "Could not open Claude.", bad: true });
      } else if (data.launched) {
        setNote({ text: "Opened in a new terminal.", bad: false });
      } else if (data.command) {
        try {
          await navigator.clipboard.writeText(data.command);
          setNote({ text: "Command copied. Paste it in a terminal.", bad: false });
        } catch {
          setNote({ text: data.command, bad: false });
        }
      }
    } catch {
      setNote({ text: "Could not reach the app.", bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openChat(taskId)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20 transition-colors hover:bg-violet-500/20"
      >
        <MessagesSquare className="size-3" />
        Claude chat
      </button>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Terminal className="size-3" />}
        In terminal
      </button>
      {note && (
        <span className={note.bad ? "text-rose-300" : "text-muted-foreground"}>
          {note.text}
        </span>
      )}
    </>
  );
}
