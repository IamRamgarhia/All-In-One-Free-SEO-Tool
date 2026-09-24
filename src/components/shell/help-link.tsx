"use client";

import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { docsUrlFor } from "@/lib/docs-links";

/**
 * The help button that sits in every page header.
 *
 * It is a client component only so it can read the current route and
 * send the person to the page about *this* screen rather than the docs
 * front page — landing on a table of contents when you are stuck is
 * barely better than no link at all.
 *
 * Opens in a new tab on purpose: the usual reason for pressing it is
 * being mid-task, and losing the screen you were on would make it worse.
 */
export function HelpLink({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <a
      href={docsUrlFor(pathname)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the documentation for this screen"
      aria-label="Help for this screen"
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 " +
        "bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-muted-foreground " +
        "transition-colors hover:border-white/20 hover:text-foreground " +
        className
      }
    >
      <CircleHelp className="size-3.5" aria-hidden="true" />
      <span className="hidden sm:inline">Help</span>
    </a>
  );
}
