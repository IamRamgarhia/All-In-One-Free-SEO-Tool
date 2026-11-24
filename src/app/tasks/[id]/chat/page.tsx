import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { Info, MessagesSquare } from "lucide-react";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { TerminalChat } from "@/components/claude/terminal-chat";
import { CopyPromptButton, DownloadPromptLink } from "@/components/claude/prompt-actions";
import { mayAccessClient } from "@/lib/client-scope";
import { mayUseClientCode } from "@/lib/code-agent-access";
import { clientCodeView } from "@/lib/code-agent-view";
import { taskTitle } from "@/lib/issue-display";

export const dynamic = "force-dynamic";

/**
 * The Claude Code chat for one task (ported from a9d65df, without the
 * corner dock: a page of its own works the same at 390 px). Owners and
 * managers only. When Claude Code cannot run for this client, the page
 * says why and offers the manual path instead.
 */
export default async function TaskChatPage({ params }: { params: Promise<{ id: string }> }) {
  const taskId = Number((await params).id);
  if (!Number.isInteger(taskId) || taskId <= 0) notFound();
  if (!(await mayUseClientCode())) notFound();

  const [row] = await db
    .select({ task: tasks, client: clients })
    .from(tasks)
    .innerJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || !(await mayAccessClient(row.client.id))) notFound();

  const t = await getTranslations("clientCode");
  const locale = await getLocale();
  const title = taskTitle(row.task.title, locale);
  const view = clientCodeView(row.client);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-20 sm:gap-6 sm:pb-0">
      <PageHeader
        title={title}
        description={`${row.client.name}${row.client.localPath ? ` · ${row.client.localPath}` : ""}`}
        icon={MessagesSquare}
        accent="violet"
        crumbs={[
          { href: `/tasks?client=${row.client.id}`, label: t("chat.crumbTasks") },
          { label: "Claude Code" },
        ]}
        noHelp
      />

      {!view.canRun && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
          <p className="flex items-start gap-2 font-medium">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <span>{t(`reasons.${view.blocker ?? "client_off"}`)}</span>
          </p>
          <p className="mt-2 text-muted-foreground">{t("manual.body")}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <CopyPromptButton kind="task" id={taskId} size="md" />
            <DownloadPromptLink kind="task" id={taskId} size="md" />
            <Link href={`/clients/${row.client.id}?tab=settings#code`} className="gsk-btn">
              {t("manual.settings")}
            </Link>
          </div>
        </section>
      )}

      <div className="h-[70dvh] min-h-[420px] overflow-hidden rounded-xl border border-white/10 shadow-xl shadow-black/30">
        <TerminalChat taskId={taskId} canRun={view.canRun} folder={row.client.localPath} title={title} />
      </div>

      {view.canRun && (
        <div className="flex flex-wrap gap-2 text-xs">
          <CopyPromptButton kind="task" id={taskId} />
          <DownloadPromptLink kind="task" id={taskId} />
        </div>
      )}
    </div>
  );
}
