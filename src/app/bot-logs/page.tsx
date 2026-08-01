export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { BotLogsClient } from "./bot-logs-client";
import { listUploads } from "./actions";

export default async function BotLogsPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const uploads = await listUploads({ limit: 30 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="AI bot log analyzer"
        description="Upload your Nginx / Apache access log. We count GPTBot, ClaudeBot, PerplexityBot, Google-Extended, and 14 other AI / search bots. No external API — pure regex on your raw logs."
        icon={Bot}
        accent="violet"
      />

      <BotLogsClient clients={allClients} uploads={uploads} />
    </div>
  );
}
