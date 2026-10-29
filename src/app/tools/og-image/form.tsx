"use client";

import { useActionState } from "react";
import { Download, Image as ImageIcon, Loader2 } from "lucide-react";
import { runOgImage, type OgState } from "./actions";

export function OgForm() {
  const [state, formAction, pending] = useActionState<OgState | null, FormData>(
    runOgImage,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Title (required)</span>
            <input
              name="title"
              required
              maxLength={100}
              placeholder="The 9 best vegan meal-prep services in 2026"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Subtitle</span>
            <input
              name="subtitle"
              maxLength={140}
              placeholder="Tested over 30 days · cost per meal · taste · variety"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Brand / site name</span>
            <input
              name="brand"
              maxLength={40}
              placeholder="Dice Codes"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Brand color (hex)</span>
            <input
              name="brandColor"
              defaultValue="#7c3aed"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 font-mono text-xs focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Template</span>
            <select
              name="template"
              defaultValue="gradient"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="gradient">Gradient</option>
              <option value="minimal">Minimal</option>
              <option value="card">Card</option>
              <option value="magazine">Magazine (with image)</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Image URL (only used by magazine template)</span>
          <input
            name="imageUrl"
            placeholder="https://example.com/photo.jpg"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-rose-500/15 px-5 text-sm font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Rendering…
            </>
          ) : (
            <>
              <ImageIcon className="mr-2 size-4" />
              Generate
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-3 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.dataUrl}
            alt="og preview"
            className="w-full rounded-lg ring-1 ring-inset ring-white/5"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">1200 × 630 PNG</span>
            <a
              href={state.dataUrl}
              download="og-image.png"
              className="inline-flex h-8 items-center rounded-md bg-rose-500/15 px-3 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25"
            >
              <Download className="mr-1.5 size-3" />
              Download PNG
            </a>
          </div>
        </section>
      )}
    </>
  );
}
