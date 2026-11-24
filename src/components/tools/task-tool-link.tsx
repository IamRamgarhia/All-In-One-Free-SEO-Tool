"use client";

/**
 * "Fix with <tool>" / "Dig into it with <tool>" on a task.
 *
 * Opens the tool on the task's page, inside the client's file and with
 * the task attached, so the banner on the tool can close it
 * (components/tools/client-context.tsx). Used by the task list, the bulk
 * list and the dashboard's priority tasks, so the three say the same.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { taskToolLink, toolSlug } from "@/lib/finding-tool-map";
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
