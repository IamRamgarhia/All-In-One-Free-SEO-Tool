"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { SystemError } from "@/db/schema";
import { REPO_NEW_ISSUE_URL } from "@/lib/repo";

export function ErrorRowControls({
  error,
  resolveAction,
}: {
  error: SystemError;
  resolveAction: (id: number) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function buildIssueBody(): string {
    return `## Error report

**Source**: ${error.source}
**Context**: \`${error.context}\`
**Message**: ${error.message}
**Occurrences**: ${error.occurrences}
**First seen**: ${error.firstSeenAt.toISOString()}
**Last seen**: ${error.lastSeenAt.toISOString()}
${error.url ? `**URL**: \`${error.url}\`\n` : ""}${error.userAgent ? `**User agent**: \`${error.userAgent}\`\n` : ""}
${error.stack ? `\n### Stack trace\n\n\`\`\`\n${error.stack}\n\`\`\`\n` : ""}`;
  }

  function copyAsIssue() {
    void navigator.clipboard.writeText(buildIssueBody());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const issueTitle = encodeURIComponent(
    `[Bug] ${error.message.slice(0, 80)}`,
  );
  const issueBody = encodeURIComponent(buildIssueBody());
  const githubUrl = `${REPO_NEW_ISSUE_URL}?title=${issueTitle}&body=${issueBody}`;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <button
        type="button"
        onClick={copyAsIssue}
        className={
          copied
            ? "inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
            : "inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-foreground/80 ring-1 ring-inset ring-white/10 hover:bg-white/10"
        }
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "Copied" : "Copy as GitHub issue"}
      </button>
      <a
        href={githubUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
      >
        <ExternalLink className="size-3" />
        Open new GitHub issue (pre-filled)
      </a>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await resolveAction(error.id);
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
      >
        <Check className="size-3" />
        {pending ? "Resolving…" : "Mark resolved"}
      </button>
    </div>
  );
}
