"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  BookOpen,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  FlaskConical,
} from "lucide-react";
import { getExplainer } from "@/lib/issue-explainers";

type Props = {
  issueType: string;
  url?: string;
  /** Render compact (just the button) or expanded by default. */
  defaultOpen?: boolean;
};

const CONFIDENCE_META = {
  definitely: {
    label: "Definitely fix this",
    icon: CheckCircle2,
    tone: "text-emerald-300",
  },
  probably: {
    label: "Probably worth fixing",
    icon: AlertTriangle,
    tone: "text-amber-300",
  },
  test: {
    label: "Worth testing",
    icon: FlaskConical,
    tone: "text-violet-300",
  },
} as const;

export function IssueExplainer({ issueType, url, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const explainer = getExplainer(issueType);

  if (!explainer) {
    // Say so, rather than rendering nothing.
    //
    // This returned null, which is how 34 of the crawler's 52 finding
    // types came to show a user a problem and not one word about
    // fixing it. The gap was invisible from the outside and invisible
    // in the code — the component looked like it was doing its job.
    //
    // A missing explainer is a hole in the product, so it should look
    // like one. audit-finding-types.test.ts now fails the build if any
    // emitted type has no entry, so this should be unreachable; it
    // stays because "unreachable" and "never happens" are not the same.
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        We haven&apos;t written the fix guide for this check yet.{" "}
        <a
          href="https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool/issues/new"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Tell us it&apos;s missing
        </a>{" "}
        and we&apos;ll add it.
      </p>
    );
  }

  const conf = CONFIDENCE_META[explainer.confidence];
  const ConfIcon = conf.icon;
  const extTool = explainer.externalTool?.({ url });

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
      >
        {open ? (
          <ChevronDown className="size-2.5" />
        ) : (
          <ChevronRight className="size-2.5" />
        )}
        <HelpCircle className="size-2.5" />
        Why does this matter?
      </button>

      {open && (
        <div className="space-y-3 rounded-md bg-white/[0.03] p-3 text-xs ring-1 ring-inset ring-white/5">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              What is it?
            </p>
            <p>{explainer.whatIsIt}</p>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Why it matters for SEO
            </p>
            <p>{explainer.whyItMatters}</p>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Wrench className="size-2.5" />
              How to fix
            </p>
            <ol className="space-y-1">
              {explainer.howToFix.map((step, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Code, and — the part that decides whether this helps or
              breaks something — which file, where in it, and how to get
              back. A snippet on its own invites pasting it into the
              wrong place, and on WordPress the wrong place takes the
              whole site down. */}
          {explainer.snippet && (
            <div className="space-y-1.5 rounded-md border border-white/10 bg-black/20 p-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Where it goes
              </p>
              <p className="text-[11px] leading-relaxed">
                {explainer.snippet.where}
              </p>

              <div className="relative">
                <pre className="mt-1 overflow-x-auto rounded border border-border bg-muted p-2.5 pr-16 text-[11px] leading-relaxed text-foreground">
                  <code>{explainer.snippet.code}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(explainer.snippet!.code)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      });
                  }}
                  className="absolute right-1.5 top-2.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] shadow-sm hover:border-foreground/25"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {explainer.snippet.caution && (
                <p className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100/90">
                  <strong>Before you paste this.</strong>{" "}
                  {explainer.snippet.caution}
                </p>
              )}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">To undo:</strong>{" "}
                {explainer.snippet.undo}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${conf.tone}`}
            >
              <ConfIcon className="size-2.5" />
              {conf.label}
            </span>
            {explainer.googleDoc && (
              <a
                href={explainer.googleDoc}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300 ring-1 ring-inset ring-blue-500/30 hover:bg-blue-500/20"
              >
                <BookOpen className="size-2.5" />
                Google&apos;s docs
                <ExternalLink className="size-2.5" />
              </a>
            )}
            {extTool && (
              <a
                href={extTool.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
              >
                {extTool.label}
                <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
