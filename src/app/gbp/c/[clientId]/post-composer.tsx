"use client";

import { useState, useTransition } from "react";
import {
  Calendar,
  Check,
  Copy,
  Gift,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { composeGbpPost } from "@/app/gbp/actions";
import { AiFeedback } from "@/components/ai-feedback";

const POST_TYPES = [
  { id: "offer", label: "Offer / promo", icon: Gift },
  { id: "event", label: "Event", icon: Calendar },
  { id: "update", label: "Update / news", icon: Newspaper },
  { id: "product", label: "Product spotlight", icon: ImageIcon },
  { id: "story", label: "Customer story", icon: MessageCircle },
] as const;

type PostType = (typeof POST_TYPES)[number]["id"];

export function GbpPostComposer({
  clientId,
  clientName,
  niche,
  city,
}: {
  clientId: number;
  clientName: string;
  niche: string | null;
  city: string | null;
}) {
  const [postType, setPostType] = useState<PostType>("update");
  const [topic, setTopic] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function generate() {
    setError(null);
    setDraft(null);
    setBusy(true);
    startTransition(async () => {
      const r = await composeGbpPost({
        clientId,
        clientName,
        niche,
        city,
        postType,
        topic,
        ctaUrl: ctaUrl || undefined,
      });
      setBusy(false);
      if (r.ok) setDraft(r.text);
      else setError(r.error);
    });
  }

  function copy() {
    if (!draft) return;
    navigator.clipboard.writeText(draft).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-violet-300" />
          GBP post composer
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Draft a Google Business post in under 30 seconds. Pick a type,
          give an angle, copy-paste into GBP. Posts appear under your
          listing for ~7 days and signal an active business.
        </p>
      </header>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          {POST_TYPES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPostType(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                postType === id
                  ? "bg-violet-500/20 text-violet-200 ring-violet-500/40"
                  : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">Angle / what to say</span>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={2}
            placeholder="20% off all services this week / new vegan menu launching Tuesday / celebrating 5 years in town…"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">CTA URL (optional)</span>
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://yoursite.com/book"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <button
          type="button"
          onClick={generate}
          disabled={busy || !topic.trim()}
          className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-3 animate-spin" />
              Drafting…
            </>
          ) : (
            "Draft post"
          )}
        </button>

        {error && (
          <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
            {error}
          </p>
        )}

        {draft && (
          <div className="space-y-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
            <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-300/90">
              Draft
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(14, Math.max(5, draft.split("\n").length + 2))}
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AiFeedback
                feature="content_idea"
                aiOutput={draft}
                clientId={clientId}
                size="sm"
              />
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
              >
                {copied ? (
                  <>
                    <Check className="size-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    Copy post
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Paste into Google Business Profile → New post → {postType}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
