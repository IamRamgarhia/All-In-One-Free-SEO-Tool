import Link from "next/link";
import { ArrowRight, Plug } from "lucide-react";

/**
 * A tool that cannot run yet, saying what is missing and taking you
 * there.
 *
 * These used to be a sentence: "Connect Google Search Console first —
 * Settings → Google." That describes a route rather than offering one,
 * and it leaves the reader to find a page, then a section within it, by
 * hand — at the exact moment they wanted to be doing something else.
 * Naming a path in prose is what a printed manual does because it has
 * no other option; a screen does.
 *
 * One component so every gate in the app looks the same and none of them
 * can quietly go back to being a dead end.
 */
export function SetupPrompt({
  title,
  detail,
  href,
  cta,
  secondary,
}: {
  /** What is missing, in a few words. */
  title: string;
  /** Why this tool needs it, and what it unlocks. One or two sentences. */
  detail?: string;
  /** Where the fix actually is. */
  href: string;
  cta: string;
  /** An optional lesser action, e.g. skipping to something that works. */
  secondary?: { label: string; href: string };
}) {
  return (
    <div className="glass-apple rounded-2xl p-5">
      <div className="flex flex-wrap items-start gap-3">
        <Plug className="mt-0.5 size-4 shrink-0 text-amber-500 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium">{title}</p>
          {detail && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {detail}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Link
              href={href}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-500/15 px-3.5 text-sm font-medium text-violet-600 ring-1 ring-inset ring-violet-500/30 transition-colors hover:bg-violet-500/25 dark:text-violet-300"
            >
              {cta}
              <ArrowRight className="size-3.5" />
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="inline-flex h-9 items-center px-2 text-sm text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
