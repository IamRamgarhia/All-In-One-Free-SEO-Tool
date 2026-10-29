"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openChat } from "./dock-store";
import { MdLite } from "./md-lite";
import { ModelPicker } from "./model-picker";

type Item = {
  id: number;
  kind: "user" | "text" | "tool" | "tool_result" | "result" | "error" | "attachment" | "suggestion";
  data: Record<string, unknown>;
};

type Status = "idle" | "running" | "error";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Claude's own orange, used for the prompt, the spinner and the logo. */
const ORANGE = "text-[#d97757]";

const GLYPHS = ["✻", "✶", "✳", "✢", "·", "✢", "✳", "✶"];
const VERBS = ["Thinking", "Working", "Reading", "Cooking", "Pondering", "Tinkering"];

function Spinner({ since }: { since: number }) {
  const [clock, setClock] = useState({ tick: 0, now: since });
  useEffect(() => {
    const t = setInterval(() => setClock((c) => ({ tick: c.tick + 1, now: Date.now() })), 140);
    return () => clearInterval(t);
  }, []);
  const { tick } = clock;
  const secs = Math.max(0, Math.floor((clock.now - since) / 1000));
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className={`w-4 text-center ${ORANGE}`}>{GLYPHS[tick % GLYPHS.length]}</span>
      <span className={ORANGE}>{VERBS[Math.floor(tick / 40) % VERBS.length]}…</span>
      <span className="text-zinc-500">({secs}s · stop with the button below)</span>
    </div>
  );
}

/**
 * The conversation with Claude Code for one task, drawn like the terminal
 * one: dark, monospace, a prompt, `●` for what Claude says and does, `⎿`
 * for what came back. History comes from the server (it is stored), so
 * closing the tab or restarting the app loses nothing; the stream picks up
 * from the last event this view has.
 */
export function TerminalChat({
  taskId,
  ready,
  folder,
  title,
}: {
  taskId: number;
  ready: boolean;
  folder?: string | null;
  title?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [since, setSince] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ready) return;
    const es = new EventSource(`/api/task-chat/${taskId}`);
    es.addEventListener("chat", (e) => {
      const item = JSON.parse((e as MessageEvent).data) as Item;
      setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
    });
    es.addEventListener("status", (e) => {
      const next = (JSON.parse((e as MessageEvent).data) as { status: Status }).status;
      setStatus((prev) => {
        if (next === "running" && prev !== "running") setSince(Date.now());
        return next;
      });
      setLoaded(true);
    });
    return () => es.close();
  }, [taskId, ready]);

  // Follow the output, unless the reader scrolled up to look at something.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, status, loaded]);

  const send = useCallback(
    async (message: string) => {
      setProblem(null);
      stick.current = true;
      try {
        const res = await fetch(`/api/task-chat/${taskId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) setProblem(data.error ?? "Could not start Claude.");
        else setDraft("");
      } catch {
        setProblem("Could not reach the app.");
      }
    },
    [taskId],
  );

  async function continueWithNext() {
    setProblem(null);
    setMoving(true);
    try {
      const res = await fetch(`/api/task-chat/${taskId}/next`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; next?: number | null; error?: string };
      if (!data.ok) setProblem(data.error ?? "Could not continue.");
      else if (data.next) openChat(data.next);
    } catch {
      setProblem("Could not reach the app.");
    } finally {
      setMoving(false);
    }
  }

  async function stop() {
    await fetch(`/api/task-chat/${taskId}`, { method: "DELETE" }).catch(() => {});
  }

  const running = status === "running";
  // Claude's guess at what you will say next, while nothing newer has happened.
  const last = items[items.length - 1];
  const suggestion = !running && last?.kind === "suggestion" ? str(last.data.text) : "";
  const fresh = loaded && items.length === 0;
  const lines = Math.min(6, Math.max(1, draft.split("\n").length));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0c0e] font-mono text-[12.5px] leading-relaxed text-zinc-200">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3"
      >
        {!ready && (
          <p className="text-zinc-400">
            Set the client&apos;s <span className="text-zinc-200">Local project folder</span> on its
            Edit page first, then come back.
          </p>
        )}

        {fresh && ready && (
          <div className="rounded-lg border border-[#d97757]/40 p-3.5">
            <div className={`flex items-center gap-2 font-semibold ${ORANGE}`}>
              <span>✻</span> Claude Code
            </div>
            {title && <div className="mt-1.5 text-zinc-100">{title}</div>}
            {folder && <div className="truncate text-zinc-500">{folder}</div>}
            <p className="mt-2 text-zinc-400">
              Reads the task brief, works in this folder, can edit files and run the project&apos;s
              build. The conversation is saved; leave and come back any time.
            </p>
            <button
              type="button"
              onClick={() => send("")}
              className="mt-3 rounded-md bg-[#d97757] px-3 py-1.5 font-semibold text-black hover:bg-[#e58a6b]"
            >
              Start this task ↵
            </button>
          </div>
        )}

        {!loaded && ready && <div className="text-zinc-500">Connecting…</div>}

        {items.map((it) => (
          <Row key={it.id} item={it} />
        ))}

        {running && <Spinner since={since} />}
      </div>

      <form
        className="shrink-0 px-3 pb-3 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() && !running) void send(draft.trim());
        }}
      >
        {problem && <p className="mb-1.5 text-rose-400">{problem}</p>}
        {ready && !running && items.length > 0 && (
          <div className="mb-1.5">
            <button
              type="button"
              disabled={moving}
              onClick={() => void continueWithNext()}
              title="Claude goes on with this client's other open tasks, highest priority first"
              className="rounded-md border border-[#d97757]/50 px-2.5 py-1 font-semibold text-[#d97757] hover:bg-[#d97757]/10 disabled:opacity-50"
            >
              {moving ? "Starting…" : "Move to next task ▸"}
            </button>
          </div>
        )}
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors ${
            running ? "border-zinc-800" : "border-zinc-700 focus-within:border-[#d97757]/70"
          }`}
        >
          <span className={`select-none ${ORANGE}`}>&gt;</span>
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !e.shiftKey && suggestion && !draft) {
                e.preventDefault();
                setDraft(suggestion);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (draft.trim() && !running) void send(draft.trim());
              }
            }}
            rows={lines}
            disabled={!ready}
            spellCheck={false}
            placeholder={
              running ? "Claude is working…" : suggestion || "Tell Claude what to do next"
            }
            className="min-w-0 flex-1 resize-none bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-zinc-600">
          <span>
            {suggestion && !draft ? (
              <>
                <span className="text-zinc-400">tab</span> to use the suggestion ·{" "}
              </>
            ) : null}
            enter to send · shift+enter for a new line
          </span>
          <ModelPicker />
          {running && (
            <button
              type="button"
              onClick={stop}
              className="rounded px-1.5 py-0.5 text-rose-400 hover:bg-rose-500/10"
            >
              ■ stop
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function prettyTool(summary: string): { name: string; arg: string } {
  const space = summary.indexOf(" ");
  const raw = space === -1 ? summary : summary.slice(0, space);
  const arg = space === -1 ? "" : summary.slice(space + 1);
  const name = raw.startsWith("mcp__") ? raw.replace(/^mcp__/, "").split("__").join(" · ") : raw;
  return { name, arg };
}

function Row({ item }: { item: Item }) {
  const d = item.data;
  switch (item.kind) {
    case "user":
      return (
        <div className="flex gap-2 rounded-md bg-zinc-800/50 px-3 py-1.5 text-zinc-100">
          <span className={`select-none ${ORANGE}`}>&gt;</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{str(d.text)}</span>
        </div>
      );
    case "text":
      return (
        <div className="flex gap-2">
          <span className="select-none text-zinc-200">●</span>
          <div className="min-w-0 flex-1">
            <MdLite text={str(d.text)} />
          </div>
        </div>
      );
    case "tool": {
      const { name, arg } = prettyTool(str(d.summary));
      return (
        <div className="flex gap-2">
          <span className="select-none text-emerald-400">●</span>
          <span className="min-w-0 break-words">
            <span className="font-semibold text-zinc-50">{name}</span>
            {arg && <span className="text-zinc-400">({arg})</span>}
          </span>
        </div>
      );
    }
    case "tool_result": {
      const text = str(d.text).trim();
      if (!text) return null;
      const all = text.split("\n");
      const first = all[0].length > 140 ? `${all[0].slice(0, 140)}…` : all[0];
      const more = all.length - 1;
      const bad = d.isError === true;
      return (
        <details className={`pl-4 ${bad ? "text-rose-400" : "text-zinc-500"}`}>
          <summary className="cursor-pointer list-none marker:hidden">
            <span className="select-none">⎿ </span>
            {bad ? "Error: " : ""}
            {first}
            {more > 0 && <span className="text-zinc-600"> … +{more} lines</span>}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[11.5px] text-zinc-400">
            {text}
          </pre>
        </details>
      );
    }
    case "result": {
      const denied = Array.isArray(d.denied) ? (d.denied as string[]) : [];
      const ok = d.ok !== false;
      return (
        <div className="space-y-1 pt-1">
          <div className={ok ? "text-emerald-400" : "text-rose-400"}>
            ✻ {ok ? "Done" : "Finished with an error"}
            <span className="text-zinc-500">
              {typeof d.turns === "number" && ` · ${d.turns} steps`}
              {typeof d.costUsd === "number" && ` · $${d.costUsd.toFixed(2)}`}
            </span>
          </div>
          {denied.length > 0 && (
            <div className="text-amber-300">
              Claude was not allowed to run:
              <ul className="mt-0.5 list-disc pl-5 text-[11.5px] text-amber-200/80">
                {denied.slice(0, 5).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "attachment":
      return (
        <div className="flex gap-2 text-cyan-300" title={str(d.path)}>
          <span className="select-none">+</span>
          <span className="min-w-0 truncate">
            {str(d.name)} <span className="text-zinc-500">attached</span>
          </span>
        </div>
      );
    case "suggestion":
      return null;
    case "error":
      return (
        <div className="flex gap-2 text-rose-400">
          <span className="select-none">✗</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{str(d.text)}</span>
        </div>
      );
  }
}
