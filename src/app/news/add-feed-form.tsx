"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addFeed, removeFeed, toggleFeed } from "./actions";

export function AddFeedForm() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{
    tone: "success" | "error";
    text: React.ReactNode;
  } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim()) return;
    setMsg(null);
    startTransition(async () => {
      const r = await addFeed({
        url: url.trim(),
        name: name.trim() || undefined,
      });
      if (!r.ok) {
        setMsg({ tone: "error", text: r.error });
        return;
      }
      setMsg({
        tone: "success",
        text: r.autoDiscovered ? (
          <>
            Found feed at{" "}
            <code className="rounded bg-emerald-500/10 px-1 py-0.5 text-[11px]">
              {r.resolvedUrl}
            </code>{" "}
            — added.
          </>
        ) : (
          <>Feed added — refresh to pull items.</>
        ),
      });
      setUrl("");
      setName("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="feed-url">Website or RSS URL</Label>
          <Input
            id="feed-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="example.com  ·  or  ·  example.com/feed"
          />
          <p className="text-[11px] text-muted-foreground">
            <Sparkles className="mr-0.5 inline size-3 text-violet-300" />
            Paste a normal website URL — we&apos;ll auto-find its RSS feed.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feed-name">Display name (optional)</Label>
          <Input
            id="feed-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-filled from feed title"
          />
        </div>
        <Button type="submit" disabled={pending || !url.trim()}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Finding feed…
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Add feed
            </>
          )}
        </Button>
      </div>
      {msg && (
        <div
          className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
            msg.tone === "success"
              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30"
          }`}
        >
          {msg.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}
      <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
        <strong className="text-violet-200">If auto-discovery fails:</strong>{" "}
        the site doesn&apos;t expose an RSS feed at any standard location.
        Paste the direct feed URL instead — they&apos;re usually at{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">/feed</code>,{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">/rss.xml</code>,{" "}
        <code className="rounded bg-white/5 px-1 py-0.5 text-[10px]">/atom.xml</code>{" "}
        — or use{" "}
        <a
          href="https://rsshub.app"
          target="_blank"
          rel="noreferrer"
          className="text-violet-300 hover:underline"
        >
          RSSHub
        </a>{" "}
        for sites without one (Twitter hashtags, YouTube channels, Reddit subs).
      </div>
    </form>
  );
}

export function FeedRow({
  feed,
}: {
  feed: {
    id: number;
    name: string;
    url: string;
    category: string;
    enabled: boolean;
    lastFetchedAt: Date | null;
    lastError: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${
          feed.category === "google"
            ? "bg-violet-500/10 text-violet-300 ring-violet-500/30"
            : feed.category === "industry"
              ? "bg-cyan-500/10 text-cyan-300 ring-cyan-500/30"
              : feed.category === "blog"
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                : feed.category === "tracker"
                  ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                  : "bg-white/5 text-muted-foreground ring-white/10"
        }`}
      >
        {feed.category}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{feed.name}</div>
        <a
          href={feed.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
        >
          {feed.url}
          <ExternalLink className="size-3" />
        </a>
        {feed.lastError && (
          <div className="text-[11px] text-rose-300">⚠ {feed.lastError}</div>
        )}
        {feed.lastFetchedAt && !feed.lastError && (
          <div className="text-[11px] text-muted-foreground/70">
            Last fetched {feed.lastFetchedAt.toLocaleString()}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await toggleFeed(feed.id, !feed.enabled);
          })
        }
        disabled={pending}
        className={`rounded-md px-2 py-1 text-[10px] uppercase tracking-wider ring-1 ring-inset ${
          feed.enabled
            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
            : "bg-white/5 text-muted-foreground ring-white/10"
        }`}
      >
        {feed.enabled ? "On" : "Off"}
      </button>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await removeFeed(feed.id);
          })
        }
        disabled={pending}
        className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
      >
        Remove
      </button>
    </li>
  );
}
