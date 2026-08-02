import { desc } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { ReportDataPaste } from "./paste";

export const dynamic = "force-dynamic";

export default async function ReportDataPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name, url: clients.url })
    .from(clients)
    .where(await clientScope())
    .orderBy(desc(clients.createdAt));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Add work to your reports"
        description="Paste plain text — backlinks built, outreach sent, comments, social posts, milestones — and AI extracts each item, structures it (kind, title, URL, details), and saves it to the client's monthly report. No forms to fill, no fields to map. Just paste and review."
        icon={Sparkles}
        accent="emerald"
      />
      <ReportDataPaste clients={allClients} />
    </div>
  );
}
