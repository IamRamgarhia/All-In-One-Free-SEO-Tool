"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { generateCode, type CodeGenState } from "./actions";
import {
  TARGETS,
  TARGET_GROUPS,
  type GeneratorTarget,
} from "@/lib/code-generator-types";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

const PRESETS: Record<
  GeneratorTarget,
  { task: string; constraints?: string } | undefined
> = {
  "wp-plugin-simple": {
    task: "Add auto-generated meta description to all posts that don't have one yet. Pull the first 155 chars of post content as the fallback.",
  },
  "wp-plugin-advanced": {
    task: "Build a 'Local SEO Schema' plugin with an admin settings page where I can enter business name, address, phone, opening hours, and it injects LocalBusiness JSON-LD on every page.",
  },
  "wp-functions": {
    task: "Add a canonical tag self-referencing every post / page automatically, but allow override via a custom field 'custom_canonical'.",
  },
  "html-snippet": {
    task: "An FAQ accordion (5 questions about my product) with FAQ schema JSON-LD baked in. Pure HTML/CSS, no JS.",
  },
  "elementor-html": {
    task: "Pricing-comparison table for 3 plans (Starter $9, Pro $29, Agency $99) styled clean modern violet. Each plan has 5 features + a CTA button.",
  },
  "shopify-liquid": {
    task: "Add Product schema with reviews + breadcrumb schema to product pages. Use Shopify's product, shop, request objects.",
  },
  "schema-jsonld": {
    task: "Article schema for a blog post titled 'How to Speed Up WordPress' by author Jane Doe published 2026-03-15, with reading time 8 min.",
  },
  htaccess: {
    task: "Force HTTPS, force www, remove trailing slashes, redirect /old-blog/* to /blog/*. Add HSTS, X-Frame-Options, Referrer-Policy headers.",
  },
  "nginx-config": {
    task: "Permanent redirect /products/old-name → /products/new-name. Add security headers (CSP, HSTS, X-Frame-Options). Cache static assets for 1 year.",
  },
  "robots-txt": {
    task: "Allow all search engines on the public site. Block /admin, /api, /cart. Block AI scrapers (GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider) from training but allow user-agent AI assistants. Include sitemap.",
  },
  "tracking-js": {
    task: "Track scroll depth (25, 50, 75, 100%) and time-on-page in 30-second buckets. Send to Google Analytics 4 as custom events.",
  },
  "react-component": {
    task: "An SEO-optimized hero section: H1, sub-headline, CTA button, optional secondary CTA. Server component. Tailwind styled. Accept props for title, subtitle, ctaLabel, ctaHref.",
  },
  "nextjs-route": {
    task: "A /pricing route. Server component. Tailwind. 3-tier pricing table with FAQ schema injected via JSON-LD. metadata export with optimized title + description.",
  },
  "drupal-twig": {
    task: "Override node--blog-post.html.twig to inject Article + BreadcrumbList JSON-LD in the head.",
  },
  "ghost-injection": {
    task: "Add LocalBusiness JSON-LD (name, address, phone, geo coords) site-wide via the Site Header injection field.",
  },
  "webflow-embed": {
    task: "Newsletter signup form (name + email) styled clean dark theme, with privacy disclaimer below. POST to /api/subscribe.",
  },
  "csv-redirects": {
    task: "20 redirects from /blog/old-slug-X → /blog/new-slug-X (where X is 1-20). 301s.",
  },
};

export default function CodeGeneratorPage() {
  const [state, formAction, pending] = useActionState<CodeGenState, FormData>(
    generateCode,
    null,
  );
  const [target, setTarget] = useState<GeneratorTarget>("html-snippet");
  const [task, setTask] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const spec = useMemo(() => TARGETS[target], [target]);

  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  // Update iframe srcDoc when generated code or preview toggle changes.
  useEffect(() => {
    if (!state?.ok || state.preview !== "iframe" || !iframeRef.current) return;
    iframeRef.current.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,sans-serif;margin:1rem;background:#fff;color:#111}</style></head><body>${state.code}</body></html>`;
  }, [state, showPreview]);

  function copy() {
    if (!state?.ok) return;
    void navigator.clipboard.writeText(state.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    if (!state?.ok) return;
    const blob = new Blob([state.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-tool-output.${state.fileExt}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyPreset() {
    const p = PRESETS[target];
    if (p) setTask(p.task);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="SEO code generator (AI-powered)"
        description="Generate WordPress plugins, HTML snippets, Elementor blocks, .htaccess rules, schema markup, Shopify Liquid, Next.js routes — anything an SEO needs to add to a website. AI writes it, you paste it. With install instructions and a preview when possible."
        icon={Code2}
        accent="violet"
      />

      <form action={formAction} className="space-y-3">
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Output type</p>
            <div className="space-y-2">
              {TARGET_GROUPS.map((g) => (
                <div key={g.label} className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.targets.map((t) => {
                      const meta = TARGETS[t];
                      const active = target === t;
                      return (
                        <label key={t}>
                          <input
                            type="radio"
                            name="target"
                            value={t}
                            checked={active}
                            onChange={() => setTarget(t)}
                            className="sr-only"
                          />
                          <span
                            className={`inline-flex cursor-pointer items-center rounded-md px-2 py-1 text-[11px] ring-1 ring-inset transition-colors ${
                              active
                                ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                                : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
                            }`}
                          >
                            {meta.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-violet-500/5 p-3 text-[11px] ring-1 ring-inset ring-violet-500/20">
            <p className="font-medium text-violet-300">
              {spec.label}
            </p>
            <p className="text-muted-foreground">{spec.description}</p>
            {spec.warning && (
              <p className="mt-1 flex items-start gap-1 text-amber-300">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {spec.warning}
              </p>
            )}
          </div>

          <label className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                What should this code do?
              </span>
              {PRESETS[target] && (
                <button
                  type="button"
                  onClick={applyPreset}
                  className="text-[10px] text-violet-300 hover:underline"
                >
                  Use example
                </button>
              )}
            </div>
            <textarea
              name="task"
              required
              rows={4}
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe in plain English. e.g. 'Add JSON-LD schema for a local restaurant: name, address, phone, opening hours, 4.5 stars from 200 reviews.'"
              className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>

          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              Constraints (optional — versions, naming, theme, etc.)
            </span>
            <input
              name="constraints"
              placeholder="e.g. WordPress 6.5+, no jQuery, prefix all functions with mybiz_"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Writing code…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                Generate {spec.label.toLowerCase()}
              </>
            )}
          </button>
        </section>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          {state.warning && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{state.warning}</span>
            </div>
          )}

          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold">
                  {TARGETS[state.target].label}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {state.code.split("\n").length} lines · {state.language}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {state.preview === "iframe" && (
                  <button
                    type="button"
                    onClick={() => setShowPreview((p) => !p)}
                    className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20"
                  >
                    <Eye className="size-3" />
                    {showPreview ? "Hide preview" : "Show preview"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={copy}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" /> Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
                >
                  <Download className="size-3" />
                  .{state.fileExt}
                </button>
              </div>
            </header>
            {state.preview === "iframe" && showPreview && (
              <div className="border-b border-white/[0.06] bg-white">
                <iframe
                  ref={iframeRef}
                  title="Live preview"
                  sandbox="allow-same-origin"
                  className="block h-[400px] w-full"
                />
              </div>
            )}
            <pre className="max-h-[600px] overflow-auto bg-black/30 p-4 text-[11px] leading-relaxed">
              <code>{state.code}</code>
            </pre>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="text-sm font-semibold">Install instructions</h3>
            <ol className="mt-2 space-y-1.5 text-sm">
              {state.installSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>

          <AiDisclaimer variant="inline" />
        </>
      )}

      <RecentRuns toolId="code-generator" refreshKey={refreshKey} />
    </div>
  );
}
