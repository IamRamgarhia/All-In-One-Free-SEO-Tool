"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, GitBranch, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { runOpenPr, type PrState } from "./actions";

export default function GithubPrPage() {
  const [state, formAction, pending] = useActionState<PrState, FormData>(
    runOpenPr,
    null,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All tools
      </Link>

      <PageHeader
        title="GitHub PR generator for SEO fixes"
        description="For sites without a CMS write-bridge (Next.js, custom code, static sites), open a structured PR on GitHub with a checklist of SEO fixes for your developer to implement. Doesn't auto-edit application code — just lands the proposal."
        icon={GitBranch}
        accent="cyan"
      />

      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">GitHub owner / org</span>
            <input
              name="owner"
              required
              placeholder="dicecodes"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">Repo</span>
            <input
              name="repo"
              required
              placeholder="dicecodes-site"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              Domain (cosmetic, used in PR body)
            </span>
            <input
              name="domain"
              required
              placeholder="dicecodes.com"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
        </div>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            GitHub Personal Access Token (scope: repo for private, public_repo
            otherwise)
          </span>
          <input
            name="token"
            type="password"
            required
            placeholder="ghp_..."
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 font-mono text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Base branch (optional)</span>
          <input
            name="baseBranch"
            placeholder="main"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Fixes — paste structured JSON (array of {`{ title, type, suggestedValue, targetUrl?, rationale? }`})
          </span>
          <textarea
            name="fixesJson"
            required
            rows={10}
            placeholder={`[
  {
    "title": "Shorten homepage title",
    "type": "title_rewrite",
    "targetUrl": "https://dicecodes.com/",
    "suggestedValue": "Dice Codes — Modern Tooling for Engineering Teams",
    "rationale": "Old title was 92 chars and got truncated in SERPs."
  }
]`}
            className="w-full rounded-md border border-white/10 bg-card/60 p-3 font-mono text-[12px] focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-cyan-500/15 px-5 text-sm font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Opening PR…
            </>
          ) : (
            <>
              <GitBranch className="mr-2 size-4" />
              Open SEO fixes PR
            </>
          )}
        </button>
        <p className="text-[11px] text-muted-foreground">
          The PAT is sent only to GitHub; it&apos;s not stored on the server.
        </p>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
          <p className="font-medium text-emerald-300">
            ✓ PR #{state.prNumber} opened on {state.branch}
          </p>
          <a
            href={state.prUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-violet-300 hover:underline"
          >
            View on GitHub
            <ExternalLink className="size-3" />
          </a>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Manifest committed at <code>{state.manifestPath}</code>.
          </p>
        </section>
      )}
    </div>
  );
}
