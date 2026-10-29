import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { MessagesSquare } from "lucide-react";
import { db } from "@/db/client";
import { clients, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { TerminalChat } from "@/components/claude/terminal-chat";

export const dynamic = "force-dynamic";

export default async function TaskChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const taskId = Number((await params).id);
  if (!Number.isInteger(taskId) || taskId <= 0) notFound();

  const [row] = await db
    .select({
      title: tasks.title,
      status: tasks.status,
      clientId: clients.id,
      clientName: clients.name,
      localPath: clients.localPath,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) notFound();

  // A task of a client this person may not see is "not found" to them.
  if (row.clientId) {
    const visible = await db
      .select({ id: clients.id })
      .from(clients)
      .where(await clientScope());
    if (!visible.some((c) => c.id === row.clientId)) notFound();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={row.title}
        description={
          row.localPath
            ? `${row.clientName} · ${row.localPath}`
            : "This client has no Local project folder yet. Set one on the client's Edit page."
        }
        icon={MessagesSquare}
        accent="violet"
        crumbs={[{ href: "/tasks", label: "Tasks" }, { label: "Claude" }]}
        noHelp
      />
      <div className="h-[72vh] min-h-[420px] overflow-hidden rounded-xl border border-white/10 shadow-xl shadow-black/30">
        <TerminalChat
          taskId={taskId}
          ready={Boolean(row.localPath)}
          folder={row.localPath}
          title={row.title}
        />
      </div>
    </div>
  );
}
