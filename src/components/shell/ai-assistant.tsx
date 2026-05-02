"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { chat, type ChatMessage } from "@/app/assistant/actions";

const SUGGESTIONS = [
  "Which client has the worst score right now?",
  "What's the most common issue across my audits?",
  "Which keywords are in striking distance?",
  "What should I focus on first this week?",
];

export function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setMessages(next);
    setInput("");
    setError(null);
    startTransition(async () => {
      const r = await chat(next);
      if (r.ok) {
        setMessages([...next, { role: "assistant", content: r.reply }]);
        setProvider(r.provider);
      } else {
        setError(r.error);
        // Don't add assistant message on error
      }
    });
  };

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="AI assistant"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 text-white shadow-xl shadow-violet-500/40 ring-1 ring-inset ring-white/30 transition-transform hover:scale-110"
      >
        <Sparkles className="size-5" />
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-violet-300" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-hidden
          />
          <div
            className="relative flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-2xl shadow-violet-500/20 backdrop-blur-xl sm:h-[70vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 shadow-md shadow-violet-500/30 ring-1 ring-inset ring-white/30">
                  <Bot className="size-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold">SEO assistant</div>
                  <div className="text-[10px] text-muted-foreground">
                    {provider
                      ? `Powered by ${provider}`
                      : "Ask anything about your data"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 ring-1 ring-violet-500/30">
                    <Sparkles className="size-6 text-violet-300" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold">
                      Ask anything about your SEO data
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-md">
                      I can see your clients, audits, keywords, tasks, and
                      recent page changes. Numbers come from your database, not
                      made up.
                    </p>
                  </div>
                  <div className="grid w-full max-w-md gap-2 pt-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-foreground/85 transition-colors hover:border-white/20 hover:bg-white/10"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ul className="space-y-4">
                  {messages.map((m, i) => (
                    <Bubble key={i} message={m} />
                  ))}
                  {pending && (
                    <li className="flex items-start gap-3">
                      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 shadow-md shadow-violet-500/30 ring-1 ring-inset ring-white/30">
                        <Bot className="size-3.5 text-white" />
                      </div>
                      <div className="rounded-2xl bg-white/5 px-4 py-2.5 text-sm">
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {error && (
              <div className="mx-5 mb-2 flex items-start gap-2 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form
              className="flex shrink-0 items-end gap-2 border-t border-white/5 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask about your SEO data…"
                disabled={pending}
                className="max-h-32 flex-1 resize-none rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="submit"
                disabled={pending || input.trim().length === 0}
                aria-label="Send"
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-inset ring-white/20 transition-opacity disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-violet-500/15 px-4 py-2.5 text-sm ring-1 ring-inset ring-violet-500/30">
          {message.content}
        </div>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3">
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 shadow-md shadow-violet-500/30 ring-1 ring-inset ring-white/30">
        <Bot className="size-3.5 text-white" />
      </div>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white/5 px-4 py-2.5 text-sm leading-relaxed">
        {message.content}
      </div>
    </li>
  );
}
