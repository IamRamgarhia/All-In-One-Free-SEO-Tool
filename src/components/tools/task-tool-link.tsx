"use client";

/**
 * "Fix with <tool>" / "Dig into it with <tool>" on a task.
 *
 * Opens the tool on the task's page, inside the client's file and with
 * the task attached, so the banner on the tool can close it
 * (components/tools/client-context.tsx). Used by the task list, the bulk
 * list, the dashboard's priority tasks and the audit findings, so all say the same.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { taskToolLink, toolLink, toolSlug } from "@/lib/finding-tool-map";
import { cleanToolName } from "@/lib/tool-context";

export function TaskToolLink({
  task,
  className,
}: {
  task: Parameters<typeof taskToolLink>[0];
  className?: string;
}) {
  const t = useTranslations("toolContext");
  const tTasks = useTranslations("tasks");
  const tCatalog = useTranslations("tools.catalog");
  const link = taskToolLink(task);
  if (!link) return null;

  const slug = toolSlug(link.toolPath);
  const name = slug && tCatalog.has(`${slug}.title`) ? cleanToolName(tCatalog(`${slug}.title`), slug) : null;
  const label = link.isTool && name ? t(link.verb === "fix" ? "fixWith" : "digWith", { tool: name }) : tTasks("openTool");

  return (
    <Link
      href={link.href}
      className={
        className ??
        "inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/20"
      }
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}

/**
 * The same button on an audit finding: opens the tool on the finding's
 * first page, inside the client's file, with the open task for that
 * finding attached when there is one. Nothing is shown when no tool
 * helps with the finding.
 */
export function FindingToolLink({
  type,
  clientId,
  url,
  taskId,
}: {
  type: string;
  clientId: number;
  url?: string | null;
  taskId?: number | null;
}) {
  const t = useTranslations("toolContext");
  const tCatalog = useTranslations("tools.catalog");
  const link = toolLink(type, { clientId, url, taskId });
  if (!link) return null;

  const slug = toolSlug(link.toolPath);
  if (!slug || !tCatalog.has(`${slug}.title`)) return null;
  const name = cleanToolName(tCatalog(`${slug}.title`), slug);

  return (
    <Link
      href={link.href}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-2 py-1 font-medium text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/20"
    >
      <span className="truncate">{t(link.verb === "fix" ? "fixWith" : "digWith", { tool: name })}</span>
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </Link>
  );
}
