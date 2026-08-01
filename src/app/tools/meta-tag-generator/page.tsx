"use client";

import { useActionState, useEffect, useState } from "react";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import {
  Code2,
  Copy,
  Check,
  Loader2,
  Wand2,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { generateMetaTags, type MetaTagState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";
import { AiDisclaimer } from "@/components/ai-disclaimer";

export default function MetaTagGeneratorPage() {
  const [state, formAction, pending] = useActionState<MetaTagState, FormData>(
    generateMetaTags,
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  function copyHtml(opt: { title: string; description: string }, key: string) {
    const html = `<title>${opt.title.replace(/</g, "&lt;")}</title>\n<meta name="description" content="${opt.description.replace(/"/g, "&quot;")}">`;
    void navigator.clipboard.writeText(html);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Meta tag generator"
        description="Produces 3 SEO-optimized title + description options for any page — keyword-led, benefit-led, and curiosity-led angles. Copy-paste ready HTML. Also generates Open Graph tags for social shares."
        icon={Code2}
        accent="violet"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Page topic (1-2 sentences about the page)
          </span>
          <textarea
            name="topic"
            required
            rows={3}
            placeholder="A landing page for our small-business invoicing app. Covers free plan, recurring invoices, payment reminders."
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Primary keyword</span>
            <input
              name="keyword"
              placeholder="free invoicing software"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Brand</span>
            <input
              name="brand"
              placeholder="InvoicePro"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Search intent</span>
            <select
              name="intent"
              defaultValue="informational"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="informational">Informational</option>
              <option value="navigational">Navigational</option>
              <option value="commercial">Commercial</option>
              <option value="transactional">Transactional</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Target audience</span>
            <input
              name="audience"
              placeholder="freelancers, small agencies"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
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
              Generating…
            </>
          ) : (
            <>
              <Wand2 className="mr-2 size-4" />
              Generate 3 options
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
        <>
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-3">
              <h3 className="text-sm font-semibold">
                3 options — pick the angle that fits your page
              </h3>
            </header>
            <ul className="divide-y divide-white/[0.06]">
              {state.options.map((opt, i) => {
                const tooLong = opt.title.length > 60;
                const descTooLong = opt.description.length > 160;
                return (
                  <li key={i} className="space-y-2 px-5 py-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Option {i + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyHtml(opt, `opt-${i}`)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
                      >
                        {copied === `opt-${i}` ? (
                          <>
                            <Check className="size-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" /> Copy HTML
                          </>
                        )}
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Title · {opt.title.length} chars
                        {tooLong && (
                          <span className="ml-1 text-rose-400">(too long)</span>
                        )}
                      </p>
                      <p className="font-medium">{opt.title}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">
                        Description · {opt.description.length} chars
                        {descTooLong && (
                          <span className="ml-1 text-rose-400">(too long)</span>
                        )}
                      </p>
                      <p className="text-xs">{opt.description}</p>
                    </div>
                    <p className="rounded-md bg-violet-500/5 p-2 text-[11px] text-violet-300 ring-1 ring-inset ring-violet-500/20">
                      {opt.rationale}
                    </p>

                    {/* SERP preview */}
                    <div className="rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5">
                      <p className="text-[10px] text-muted-foreground mb-1">
                        Google SERP preview
                      </p>
                      <p className="truncate text-[15px] text-blue-300 leading-tight">
                        {opt.title}
                      </p>
                      <p className="text-[12px] text-emerald-300/80">
                        yoursite.com
                      </p>
                      <p className="text-[13px] text-muted-foreground leading-snug">
                        {opt.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="text-sm font-semibold">Open Graph (social share) tags</h3>
            <pre className="mt-2 overflow-x-auto rounded-md bg-white/[0.03] p-3 text-[11px] ring-1 ring-inset ring-white/5">
{`<meta property="og:title" content="${state.socialPreview.ogTitle}">
<meta property="og:description" content="${state.socialPreview.ogDescription}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${state.socialPreview.ogTitle}">
<meta name="twitter:description" content="${state.socialPreview.ogDescription}">`}
            </pre>
          </section>

          <AiDisclaimer variant="inline" />
        </>
      )}

      <RecentRuns toolId="meta-tag-generator" refreshKey={refreshKey} />
    </div>
  );
}
