"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MdLite } from "./md-lite";

type Item = {
  id: number;
  kind: "user" | "text" | "tool" | "tool_result" | "result" | "error" | "suggestion";
  data: Record<string, unknown>;
};

type Status = "idle" | "running" | "error";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Claude's own orange, used for the prompt, the spinner and the logo. */
const ORANGE = "text-[#d97757]";

const GLYPHS = ["✻", "✶", "✳", "✢", "·", "✢", "✳", "✶"];

function Spinner({ since }: { since: number }) {
  const t = useTranslations("clientCode.chat");
  const [clock, setClock] = useState({ tick: 0, now: since });
  useEffect(() => {
    const timer = setInterval(() => setClock((c) => ({ tick: c.tick + 1, now: Date.now() })), 140);
    return () => clearInterval(timer);
  }, []);
  const secs = Math.max(0, Math.floor((clock.now - since) / 1000));
  return (
    <div className="flex flex-wrap items-center gap-x-2 pt-1">
      <span className={`w-4 text-center ${ORANGE}`}>{GLYPHS[clock.tick % GLYPHS.length]}</span>
      <span className={ORANGE}>{t("working")}</span>
      <span className="text-zinc-500">{t("workingFor", { secs })}</span>
    </div>
  );
}

/**
 * The conversation with Claude Code for one task, drawn like the terminal
 * one: dark, monospace, a prompt, `●` for what Claude says and does, `⎿`
 * for what came back. History comes from the server (it is stored), so
 * closing the tab or restarting the app loses nothing; the stream picks up
 * from the last event this view has.
 *
 * `canRun` is the server's decision (client switch on, Claude Code found,
 * folder set): when false the history is still shown, and nothing can be
 * sent.
 */
export function TerminalChat({
  taskId,
  canRun,
  folder,
  title,
}: {
  taskId: number;
  canRun: boolean;
  folder?: string | null;
  title?: string;
}) {
  const t = useTranslations("clientCode.chat");
  const tr = useTranslations("clientCode.reasons");
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [since, setSince] = useState(() => Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
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
    es.onerror = () => setLoaded(true);
    return () => es.close();
  }, [taskId]);

  // Follow the output, unless the reader scrolled up to look at something.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items.length, status, loaded]);

  const reason = useCallback(
    (code: string | undefined) => (code && tr.has(code) ? tr(code) : t("startFailed")),
    [t, tr],
  );

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
        const data = (await res.json()) as { ok: boolean; code?: string };
        if (!data.ok) setProblem(reason(data.code));
        else setDraft("");
      } catch {
        setProblem(t("unreachable"));
      }
    },
    [taskId, reason, t],
  );

  async function stop() {
    await fetch(`/api/task-chat/${taskId}`, { method: "DELETE" }).catch(() => {});
  }

  const running = status === "running";
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
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4"
      >
        {fresh && canRun && (
          <div className="rounded-lg border border-[#d97757]/40 p-3.5">
            <div className={`flex items-center gap-2 font-semibold ${ORANGE}`}>
              <span aria-hidden>✻</span> Claude Code
            </div>
            {title && <div className="mt-1.5 break-words text-zinc-100">{title}</div>}
            {folder && <div className="break-all text-zinc-500">{folder}</div>}
            <p className="mt-2 text-zinc-400">{t("intro")}</p>
            <button
              type="button"
              onClick={() => send("")}
              className="mt-3 min-h-11 rounded-md bg-[#d97757] px-3 py-1.5 font-semibold text-black hover:bg-[#e58a6b]"
            >
              {t("start")}
            </button>
          </div>
        )}

        {fresh && !canRun && <p className="text-zinc-500">{t("emptyOff")}</p>}

        {!loaded && <div className="text-zinc-500">{t("connecting")}</div>}

        {items.map((it) => (
          <Row key={it.id} item={it} />
        ))}

        {running && <Spinner since={since} />}
      </div>

      {canRun && (
        <form
          className="shrink-0 px-3 pb-3 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() && !running) void send(draft.trim());
          }}
        >
          {problem && (
            <p role="alert" className="mb-1.5 text-rose-400">
              {problem}
            </p>
          )}
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors ${
              running ? "border-zinc-800" : "border-zinc-700 focus-within:border-[#d97757]/70"
            }`}
          >
            <span aria-hidden className={`select-none ${ORANGE}`}>
              &gt;
            </span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (draft.trim() && !running) void send(draft.trim());
                }
              }}
              rows={lines}
              spellCheck={false}
              aria-label={t("inputLabel")}
              placeholder={running ? t("placeholderRunning") : t("placeholder")}
              className="min-w-0 flex-1 resize-none bg-transparent text-[16px] text-zinc-100 outline-none placeholder:text-zinc-600 sm:text-[12.5px]"
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-zinc-500">
            <span className="hidden sm:inline">{t("keys")}</span>
            <div className="ml-auto flex items-center gap-2">
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="min-h-9 rounded px-2 py-0.5 text-rose-400 hover:bg-rose-500/10"
                >
                  {t("stop")}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="min-h-9 rounded px-2 py-0.5 text-[#d97757] hover:bg-[#d97757]/10 disabled:opacity-40 sm:hidden"
                >
                  {t("send")}
                </button>
              )}
            </div>
          </div>
        </form>
      )}
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
  const t = useTranslations("clientCode.chat");
  const d = item.data;
  switch (item.kind) {
    case "user":
      return (
        <details className="rounded-md bg-zinc-800/50 px-3 py-1.5 text-zinc-100">
          <summary className="flex cursor-pointer list-none gap-2 marker:hidden">
            <span aria-hidden className={`select-none ${ORANGE}`}>
              &gt;
            </span>
            <span className="min-w-0 break-words">{firstLine(str(d.text))}</span>
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11.5px] text-zinc-400">
            {str(d.text)}
          </pre>
        </details>
      );
    case "text":
      return (
        <div className="flex gap-2">
          <span aria-hidden className="select-none text-zinc-200">
            ●
          </span>
          <div className="min-w-0 flex-1 break-words">
            <MdLite text={str(d.text)} />
          </div>
        </div>
      );
    case "tool": {
      const { name, arg } = prettyTool(str(d.summary));
      return (
        <div className="flex gap-2">
          <span aria-hidden className="select-none text-emerald-400">
            ●
          </span>
          <span className="min-w-0 break-all">
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
          <summary className="cursor-pointer list-none break-all marker:hidden">
            <span aria-hidden className="select-none">
              ⎿{" "}
            </span>
            {bad ? t("toolError") : ""}
            {first}
            {more > 0 && <span className="text-zinc-600"> {t("moreLines", { count: more })}</span>}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[11.5px] text-zinc-400">
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
            ✻ {ok ? t("resultOk") : t("resultError")}
            {typeof d.turns === "number" && (
              <span className="text-zinc-500"> · {t("steps", { count: d.turns })}</span>
            )}
          </div>
          {ok && <div className="text-zinc-500">{t("reviewHint")}</div>}
          {denied.length > 0 && (
            <div className="text-amber-300">
              {t("denied")}
              <ul className="mt-0.5 list-disc pl-5 text-[11.5px] text-amber-200/80">
                {denied.slice(0, 5).map((x, i) => (
                  <li key={i} className="break-all">
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }
    case "suggestion":
      return null;
    case "error":
      return <ErrorRow code={str(d.code)} detail={str(d.detail) || str(d.text)} />;
  }
}

function ErrorRow({ code, detail }: { code: string; detail: string }) {
  const t = useTranslations("clientCode.chat.errors");
  const text = code && t.has(code) ? t(code) : t("exit");
  return (
    <div className="flex gap-2 text-rose-400">
      <span aria-hidden className="select-none">
        ✗
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words">
        {text}
        {detail ? <span className="text-rose-300/70"> ({detail})</span> : null}
      </span>
    </div>
  );
}

function firstLine(s: string): string {
  const line = s.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 160 ? `${line.slice(0, 160)}…` : line;
}
