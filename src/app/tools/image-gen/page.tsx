"use client";

import { useActionState, useEffect, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import {
  Download,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runImageGen, type GenState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export default function ImageGenPage() {
  const [state, formAction, pending] = useActionState<GenState, FormData>(
    runImageGen,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  function download() {
    if (!state?.ok) return;
    const a = document.createElement("a");
    a.href = state.dataUrl;
    const slug =
      state.prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || "image";
    a.download = `${slug}.png`;
    a.click();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="AI image generation (BYO OpenAI key)"
        description="Generate hero images, OG images, or illustrative graphics for content using DALL·E 3. Requires an OpenAI API key in Settings. Output is downloaded directly — no server storage."
        icon={ImageIcon}
        accent="violet"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Prompt</span>
          <textarea
            name="prompt"
            required
            rows={4}
            placeholder="A flat-design illustration of a person reviewing analytics dashboards on a laptop, violet + cyan gradient, modern minimal style, no text"
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Aspect</span>
            <select
              name="aspect"
              defaultValue="landscape"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="landscape">Landscape (1792×1024)</option>
              <option value="square">Square (1024×1024)</option>
              <option value="portrait">Portrait (1024×1792)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Quality</span>
            <select
              name="quality"
              defaultValue="standard"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="standard">Standard (~$0.04)</option>
              <option value="hd">HD (~$0.08)</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Style</span>
            <select
              name="style"
              defaultValue="vivid"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="vivid">Vivid (more dramatic)</option>
              <option value="natural">Natural (softer, more realistic)</option>
            </select>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Generating… (15-30s)
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Generate image
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Uses your OpenAI API key. Cost: $0.04 standard / $0.08 HD per
          image. No images are stored on the server — they go straight to
          your download.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Generated image</h2>
            <button
              type="button"
              onClick={download}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
            >
              <Download className="size-3" />
              Download PNG
            </button>
          </header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.dataUrl}
            alt={state.prompt}
            className="w-full rounded-lg ring-1 ring-inset ring-white/10"
          />
          <p className="text-[11px] text-muted-foreground">
            {Math.round(state.sizeBytes / 1024)} KB
            {state.revisedPrompt && (
              <>
                {" · OpenAI revised prompt: "}
                <em>&quot;{state.revisedPrompt}&quot;</em>
              </>
            )}
          </p>
          <AiDisclaimer variant="inline" />
        </section>
      )}

      <RecentRuns toolId="image-gen" refreshKey={refreshKey} />
    </div>
  );
}
