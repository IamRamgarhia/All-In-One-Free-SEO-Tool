"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ClipboardCopy, Download, Loader2, TerminalSquare } from "lucide-react";
import { toast } from "sonner";

/**
 * The manual path, always there for owners and managers: copy the prompt
 * for a task or a whole audit, or download it as a .md, and paste it into
 * any coding assistant on the client's code. Nothing runs on this machine.
 * The text comes from /api/code-prompt (lib/task-prompt).
 */
export function CopyPromptButton({
  kind,
  id,
  size = "sm",
}: {
  kind: "task" | "audit";
  id: number;
  size?: "sm" | "md";
}) {
  const t = useTranslations("clientCode.prompt");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function copy() {
    setState("busy");
    const url = `/api/code-prompt/${kind}/${id}`;
    try {
      // Handing the clipboard a promise keeps the click's permission while
      // the text is fetched (Safari drops it otherwise).
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = fetch(url).then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          return new Blob([await r.text()], { type: "text/plain" });
        });
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        await navigator.clipboard.writeText(await r.text());
      }
      setState("done");
      toast.success(t("copied"));
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
      toast.error(t("copyFailed"));
    }
  }

  const cls =
    size === "md"
      ? "gsk-btn"
      : "inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md bg-white/5 px-2 py-0.5 font-medium text-foreground/90 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10";

  return (
    <button type="button" onClick={copy} disabled={state === "busy"} className={cls} title={t("copyHint")}>
      {state === "busy" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state === "done" ? (
        <Check className="size-3.5 text-emerald-400" />
      ) : (
        <ClipboardCopy className="size-3.5" />
      )}
      {t("copy")}
    </button>
  );
}

export function DownloadPromptLink({
  kind,
  id,
  size = "sm",
}: {
  kind: "task" | "audit";
  id: number;
  size?: "sm" | "md";
}) {
  const t = useTranslations("clientCode.prompt");
  const cls =
    size === "md"
      ? "gsk-btn"
      : "inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-muted-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/5 hover:text-foreground";
  return (
    <a href={`/api/code-prompt/${kind}/${id}?download=1`} className={cls} title={t("downloadHint")} download>
      <Download className="size-3.5" />
      {t("download")}
    </a>
  );
}

/** Link to the task's Claude Code chat; only rendered when the server said it can run. */
export function ClaudeChatLink({ taskId }: { taskId: number }) {
  const t = useTranslations("clientCode.prompt");
  return (
    <Link
      href={`/tasks/${taskId}/chat`}
      className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md bg-violet-500/10 px-2 py-0.5 font-medium text-violet-300 ring-1 ring-inset ring-violet-500/20 transition-colors hover:bg-violet-500/20"
    >
      <TerminalSquare className="size-3.5" />
      {t("claude")}
    </Link>
  );
}
