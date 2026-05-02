export const dynamic = "force-dynamic";

import { Unlink } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function BrokenLinksIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: "Run scan",
    primaryTone: "violet" as const,
    secondary: "Fetches a page, checks every link for 404s + redirects",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Broken link finder"
        description="Pick a client. Paste any URL on their site — we fetch it, extract every link, then check status codes for all of them in parallel."
        icon={Unlink}
        accent="rose"
      />
      <ClientToolGrid cards={cards} basePath="/broken-links/c" />
    </div>
  );
}
