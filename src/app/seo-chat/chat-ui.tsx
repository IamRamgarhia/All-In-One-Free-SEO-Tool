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
import { SEO_SKILLS, type SeoSkillId } from "@/lib/seo-skills";

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

export function SeoChatUi() {
  const [messages, setMessages] = useState<SeoChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [skill, setSkill] = useState<SeoSkillId>("general");
  const [research, setResearch] = useState(false);
  const [length, setLength] = useState<AnswerLength>("short");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  const activeSkill = SEO_SKILLS.find((s) => s.id === skill) ?? SEO_SKILLS[0];

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
        skill,
        research,
        length,
      );
      if (r.ok) {
        setMessages([...next, { role: "assistant", content: r.reply }]);
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
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Skill picker */}
      <aside className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-violet-300" />
            Focus
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Narrow the AI to a specialty.
          </p>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {SEO_SKILLS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSkill(s.id)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                skill === s.id
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-foreground/80 hover:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{s.emoji}</span>
              <span className="min-w-0">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-[10px] text-muted-foreground line-clamp-2">
                  {s.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <div className="glass-apple relative flex h-[70vh] flex-col overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Bot className="size-4 text-violet-300" />
            {activeSkill.emoji} {activeSkill.name}
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {activeSkill.description}
          </p>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl bg-white/[0.03] p-3 text-muted-foreground ring-1 ring-inset ring-white/5">
                Hi — I&apos;m focused on{" "}
                <span className="text-violet-300">{activeSkill.name.toLowerCase()}</span>{" "}
                right now. Try one of these or paste your own question.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeSkill.prompts.map((p) => (
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
              {activeSkill.tools.length > 0 && (
                <div className="rounded-xl bg-violet-500/[0.06] p-3 ring-1 ring-inset ring-violet-500/20">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Related tools
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {activeSkill.tools.map((t) => (
                      <a
                        key={t}
                        href={t}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-violet-200 hover:bg-white/10"
                      >
                        {t}
                      </a>
                    ))}
                  </div>
                </div>
              )}
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
            placeholder={`Ask about ${activeSkill.name.toLowerCase()}…`}
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

        <div className="border-t border-white/[0.04] bg-white/[0.01] px-3 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Zap className="size-3" />
            ~{estimateTokens(input, length, research)} tok est.
          </span>
          <span>
            {length === "short" ? "≈ $0.0001-$0.001 / answer" : "≈ $0.001-$0.01 / answer"}
            {" · "}
            <a href="/settings/ai-usage" className="hover:text-foreground hover:underline">
              usage
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
