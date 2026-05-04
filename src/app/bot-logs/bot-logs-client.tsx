"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FileUp,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  deleteUpload,
  parseAndStoreLog,
  type ParseResult,
} from "./actions";

const AI_BOTS = new Set([
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "anthropic-ai",
  "cohere-ai",
  "Bytespider",
  "CCBot",
  "Amazonbot",
  "Applebot-Extended",
]);

type Upload = {
  id: number;
  sourceName: string | null;
  rawByteSize: number | null;
  lineCount: number | null;
  botCounts: Record<string, number> | null;
  uploadedAt: Date;
  clientId: number | null;
  clientName: string | null;
};

export function BotLogsClient({
  clients,
  uploads,
}: {
  clients: { id: number; name: string }[];
  uploads: Upload[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const router = useRouter();

  function onFile(file: File | null) {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startTransition(async () => {
        const r = await parseAndStoreLog({
          text,
          sourceName: file.name,
          clientId: clientId ? Number(clientId) : null,
        });
        setResult(r);
        if (r.ok) router.refresh();
      });
    };
    reader.readAsText(file);
  }

  function remove(id: number) {
    if (!confirm("Delete this upload?")) return;
    startTransition(async () => {
      await deleteUpload(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <Label className="text-sm">Upload access log</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Combined log format expected (Nginx default / Apache common). We
          parse the User-Agent field and count occurrences of each bot.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".log,.txt,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            disabled={pending}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Parsing…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Choose log file
              </>
            )}
          </Button>
          {clients.length > 0 && (
            <>
              <Label htmlFor="bl-client" className="text-xs">
                Client (optional)
              </Label>
              <select
                id="bl-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={pending}
                className="flex h-9 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Not assigned</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {fileName && !pending && (
            <span className="text-xs text-muted-foreground">
              <FileUp className="mr-1 inline size-3" />
              {fileName}
            </span>
          )}
        </div>

        {result && result.ok && (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="mr-1 inline size-3.5" />
              Parsed {result.totalLines.toLocaleString()} lines —{" "}
              {result.matchedLines.toLocaleString()} bot hits across{" "}
              {Object.keys(result.botCounts).length} unique user-agents.
            </div>

            {Object.keys(result.statusBreakdown).length > 0 && (
              <div className="rounded-lg bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.04]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bot status codes
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {Object.entries(result.statusBreakdown).map(
                    ([bucket, count]) => {
                      const tone =
                        bucket === "2xx"
                          ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                          : bucket === "3xx"
                            ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
                            : bucket === "4xx"
                              ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                              : bucket === "5xx"
                                ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                                : "bg-white/5 text-muted-foreground ring-white/10";
                      return (
                        <span
                          key={bucket}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ring-1 ring-inset ${tone}`}
                        >
                          {bucket}{" "}
                          <span className="font-bold">
                            {count.toLocaleString()}
                          </span>
                        </span>
                      );
                    },
                  )}
                </div>
                {(result.statusBreakdown["4xx"] ?? 0) +
                  (result.statusBreakdown["5xx"] ?? 0) >
                  0 && (
                  <p className="mt-1.5 text-[11px] text-amber-300/80">
                    Bots hitting 4xx / 5xx = wasted crawl budget. Fix or
                    redirect those paths.
                  </p>
                )}
              </div>
            )}

            {result.topPaths.length > 0 && (
              <div className="rounded-lg bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.04]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Top {Math.min(20, result.topPaths.length)} bot-crawled paths
                </div>
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {result.topPaths.map((p) => (
                    <li
                      key={p.path}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-mono">{p.path}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {result && !result.ok && (
          <div className="mt-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            <AlertCircle className="mr-1 inline size-3.5" />
            {result.error}
          </div>
        )}
      </section>

      {uploads.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Recent uploads</h2>
            <p className="text-[11px] text-muted-foreground">
              Each upload is a snapshot — re-upload weekly to spot trends in AI
              bot crawl frequency.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.04]">
            {uploads.map((u) => {
              const counts = u.botCounts ?? {};
              const sorted = Object.entries(counts).sort(
                (a, b) => b[1] - a[1],
              );
              const aiTotal = sorted
                .filter(([k]) => AI_BOTS.has(k))
                .reduce((s, [, v]) => s + v, 0);
              return (
                <li key={u.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 text-violet-300" />
                        <span className="truncate font-medium">
                          {u.sourceName ?? `Upload #${u.id}`}
                        </span>
                        {u.clientName && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] ring-1 ring-inset ring-white/10">
                            {u.clientName}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {(u.lineCount ?? 0).toLocaleString()} lines ·{" "}
                        {((u.rawByteSize ?? 0) / 1024).toFixed(1)} KB ·{" "}
                        {u.uploadedAt.toLocaleString()}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {sorted.map(([bot, count]) => (
                          <span
                            key={bot}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                              AI_BOTS.has(bot)
                                ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                                : "bg-white/5 text-muted-foreground ring-white/10"
                            }`}
                          >
                            {bot}
                            <span className="font-bold tabular-nums">
                              {count.toLocaleString()}
                            </span>
                          </span>
                        ))}
                      </div>
                      {aiTotal > 0 && (
                        <div className="mt-1 text-[11px] text-violet-300">
                          AI-bot hits this period: {aiTotal.toLocaleString()}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(u.id)}
                      title="Delete"
                      className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
