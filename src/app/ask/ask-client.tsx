"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Bot,
  Loader2,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { askTheTool } from "./actions";

type Turn =
  | { kind: "user"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "error"; text: string };

const SUGGESTED = [
  "Why might traffic have dropped recently?",
  "What's the single highest-impact fix I should make this week?",
  "Which content is decaying and worth refreshing?",
  "Pick 3 keywords I'm closest to ranking for on page 1.",
  "What's missing from my technical SEO baseline?",
];

export function AskClient({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const [clientId, setClientId] = useState<string>(
    clients[0]?.id.toString() ?? "",
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startTransition] = useTransition();

  function ask(q: string = question) {
    if (!q.trim()) return;
    const userTurn: Turn = { kind: "user", text: q };
    setTurns((t) => [...t, userTurn]);
    setQuestion("");

    startTransition(async () => {
      const r = await askTheTool({
        clientId: clientId ? Number(clientId) : null,
        question: q,
      });
      if (r.ok) {
        setTurns((t) => [...t, { kind: "tool", text: r.answer }]);
      } else {
        setTurns((t) => [...t, { kind: "error", text: r.error }]);
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="glass-apple relative overflow-hidden rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="ask-client" className="text-xs">
            Answer in context of
          </Label>
          <select
            id="ask-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={pending}
            className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">No specific client (general SEO Q&amp;A)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {clientId && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <Sparkles className="size-2.5" />
              Pulling real audit + keyword data
            </span>
          )}
        </div>
      </section>

      {turns.length === 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
          <h2 className="text-sm font-semibold">Try one of these</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                disabled={pending}
                className="rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.08] hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {turns.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <div className="space-y-3 p-5">
            {turns.map((t, i) => (
              <div
                key={i}
                className={`flex gap-3 ${t.kind === "user" ? "" : ""}`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
                    t.kind === "user"
                      ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
                      : t.kind === "error"
                        ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                        : "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                  }`}
                >
                  {t.kind === "user" ? (
                    <User className="size-3.5" />
                  ) : t.kind === "error" ? (
                    <AlertCircle className="size-3.5" />
                  ) : (
                    <Bot className="size-3.5" />
                  )}
                </div>
                <div
                  className={`min-w-0 flex-1 whitespace-pre-wrap text-sm ${
                    t.kind === "error" ? "text-rose-200/90" : ""
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        </section>
      )}

      <section className="glass-apple sticky bottom-4 relative overflow-hidden rounded-2xl p-3">
        <div className="flex gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask in plain English… (Shift+Enter for newline)"
            rows={2}
            disabled={pending}
            className="w-full flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button
            type="button"
            onClick={() => ask()}
            disabled={pending || !question.trim()}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
