export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { AskClient } from "./ask-client";

export default async function AskPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Ask the tool"
        description="Plain-English Q&A on top of your real data. Pick a client and ask why traffic dropped, what to fix first, what's worth refreshing — answered against that client's actual audits, keywords, and tasks."
        icon={Bot}
        accent="violet"
      />
      <AskClient clients={allClients} />
    </div>
  );
}
