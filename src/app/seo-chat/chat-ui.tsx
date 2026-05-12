"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  AlignJustify,
  Bot,
  Globe,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { seoChat, type SeoChatMessage, type AnswerLength } from "./actions";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  AiModelPicker,
  type ModelSelection,
} from "@/components/ai-model-picker";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Estimate total tokens that will be billed for the next call. ~4 chars/token.
 * Includes a baseline for system prompt + skill addendum + retrieved knowledge,
 * plus the user input + expected output cap.
 */
function estimateTokens(
  userInput: string,
  length: AnswerLength,
  research: boolean,
): number {
  const inputTokens = Math.ceil(userInput.length / 4);
  // Baseline system prompt — measured empirically
  const systemBaseline = 600;
  // Knowledge corpus chunk(s) injected
  const knowledgeBaseline = length === "short" ? 250 : 600;
  // Live research SERP injection
  const researchBaseline = research ? 800 : 0;
  // Expected output cap
  const outputCap = length === "short" ? 250 : 1500;
  return inputTokens + systemBaseline + knowledgeBaseline + researchBaseline + outputCap;
}

const STARTER_PROMPTS = [
  "Walk me through Google's confirmed ranking factors in 2026 — by importance.",
  "How do I get cited in Google AI Overviews for commercial queries?",
  "My LCP is 4.2s on mobile — what do I fix first?",
  "Audit this title and meta — give me 3 better variants.",
  "Generate the hreflang block for en-US, en-GB, fr-FR, de-DE, x-default.",
  "Should I block GPTBot? Tradeoffs?",
];

export function SeoChatUi() {
  const [messages, setMessages] = useState<SeoChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [research, setResearch] = useState(false);
  const [length, setLength] = useState<AnswerLength>("short");
  const [modelSel, setModelSel] = useState<ModelSelection>({
    provider: undefined,
    model: undefined,
  });
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest skill the server inferred from the user's query — surfaced as a
  // subtle badge so the user can see which specialty the AI focused on.
  const [inferredSkill, setInferredSkill] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const userMsg: SeoChatMessage = {
      role: "user",
      content: trimmed,
      imageDataUrl: imageDataUrl ?? undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setError(null);
    const imageToSend = imageDataUrl;
    setImageDataUrl(null);
    if (fileRef.current) fileRef.current.value = "";

    startTransition(async () => {
      const r = await seoChat(
        next,
        imageToSend ?? undefined,
        // Server-side auto-detection — no skill pinned from the UI.
        undefined,
        research,
        length,
        { provider: modelSel.provider, model: modelSel.model },
        conversationId,
      );
      if (r.ok) {
        setMessages([...next, { role: "assistant", content: r.reply }]);
        setConversationId(r.conversationId);
        setInferredSkill(r.inferredSkillName);
      } else {
        setError(r.error);
      }
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
      setError("Image must be PNG / JPEG / GIF / WebP.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image too large (>4MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="glass-apple relative flex h-[75vh] flex-col overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="size-4 text-violet-300" />
            SEO Chat
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            One chat for every SEO topic — the AI picks the right specialty
            from your question.
          </p>
        </div>
        {inferredSkill && (
          <span
            title="The specialty the AI focused on for the last reply"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-[10px] font-medium text-violet-200 ring-1 ring-inset ring-violet-500/30"
          >
            <Sparkles className="size-3" />
            {inferredSkill}
          </span>
        )}
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm"
      >
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/[0.03] p-3 text-muted-foreground ring-1 ring-inset ring-white/5">
              Ask anything SEO. I&apos;ll auto-focus on the right specialty —
              technical, on-page, AI visibility, schema, local, hreflang,
              CWV, etc. Drop an image for image-SEO analysis.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full bg-white/5 px-3 py-1 text-xs text-violet-200 ring-1 ring-inset ring-violet-500/20 hover:bg-violet-500/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] space-y-2"
                : "max-w-[90%] space-y-2"
            }
          >
            {m.imageDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={m.imageDataUrl}
                alt="upload"
                className="max-h-48 rounded-lg ring-1 ring-inset ring-white/10"
              />
            )}
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl rounded-br-md bg-violet-500/15 px-3 py-2 text-violet-50 ring-1 ring-inset ring-violet-500/30"
                  : "rounded-2xl rounded-bl-md bg-white/[0.04] px-3 py-2 ring-1 ring-inset ring-white/5"
              }
            >
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {m.content}
              </pre>
            </div>
            {m.role === "assistant" && <AiDisclaimer variant="inline" />}
          </div>
        ))}

        {pending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <div className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {error}
          </div>
        )}
      </div>

      {imageDataUrl && (
        <div className="flex items-center gap-2 border-t border-white/[0.06] bg-violet-500/[0.05] px-5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt="staged"
            className="h-12 rounded ring-1 ring-inset ring-white/10"
          />
          <span className="text-xs text-muted-foreground">
            Image staged — will send with your next message.
          </span>
          <button
            type="button"
            onClick={() => {
              setImageDataUrl(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="ml-auto inline-flex h-7 items-center rounded-md bg-white/5 px-2 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
          >
            <X className="mr-1 size-3" />
            Remove
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-white/[0.06] bg-white/[0.02] p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={onFile}
          className="hidden"
          id="seo-chat-file"
        />
        <label
          htmlFor="seo-chat-file"
          title="Upload image for image-SEO analysis"
          className="inline-flex h-9 cursor-pointer items-center rounded-md bg-white/5 px-3 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
        >
          <ImagePlus className="size-4" />
        </label>
        <button
          type="button"
          onClick={() => setResearch((v) => !v)}
          title={
            research
              ? "Live research ON — fetches a Google SERP before each answer"
              : "Live research OFF — click to fetch live SERP data with each question"
          }
          className={`inline-flex h-9 items-center rounded-md px-3 text-xs font-medium ring-1 ring-inset transition-colors ${
            research
              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
              : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
          }`}
        >
          <Globe className="mr-1 size-3" />
          {research ? "Research: ON" : "Research"}
        </button>
        <button
          type="button"
          onClick={() => setLength(length === "short" ? "detailed" : "short")}
          title={
            length === "short"
              ? "Short answers (~250 tokens — saves credits). Click to switch to Detailed."
              : "Detailed answers (~1500 tokens). Click to switch back to Short."
          }
          className={`inline-flex h-9 items-center rounded-md px-3 text-xs font-medium ring-1 ring-inset transition-colors ${
            length === "short"
              ? "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
              : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
          }`}
        >
          {length === "short" ? (
            <>
              <Wind className="mr-1 size-3" />
              Short
            </>
          ) : (
            <>
              <AlignJustify className="mr-1 size-3" />
              Detailed
            </>
          )}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything SEO…"
          disabled={pending}
          className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={pending || (!input.trim() && !imageDataUrl)}
          className="inline-flex h-9 items-center rounded-md bg-violet-500/20 px-3 text-violet-200 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/30 disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </form>

      <div className="flex items-center justify-between gap-3 border-t border-white/[0.04] bg-white/[0.01] px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="flex shrink-0 items-center gap-1.5">
          <Zap className="size-3" />~{estimateTokens(input, length, research)}{" "}
          tok
        </span>
        <AiModelPicker
          selection={modelSel}
          onChange={setModelSel}
          size="sm"
        />
        <span className="truncate italic text-muted-foreground/70">
          AI can make mistakes — verify before applying
        </span>
        <span className="shrink-0">
          {length === "short" ? "≈ $0.0001-$0.001" : "≈ $0.001-$0.01"}
          {" · "}
          <a
            href="/settings/ai-usage"
            className="hover:text-foreground hover:underline"
          >
            usage
          </a>
        </span>
      </div>
    </div>
  );
}
