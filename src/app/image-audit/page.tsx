export const dynamic = "force-dynamic";

import { Image as ImageIcon } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function ImageAuditIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    logoUrl: c.logoUrl,
    niche: c.niche,
    primary: "Run audit",
    primaryTone: "violet" as const,
    secondary: "Alt text, dimensions, lazy-load, format, size — all images per page",
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Image SEO audit"
        description="Pick a client. Paste any page URL — we extract every image, fetch HEAD requests for size + format, classify alt-text/dimension/lazy-load issues."
        icon={ImageIcon}
        accent="amber"
      />
      <ClientToolGrid cards={cards} basePath="/image-audit/c" />
    </div>
  );
}
