export const dynamic = "force-dynamic";

import { MapPin } from "lucide-react";
import { db } from "@/db/client";
import { clients, resourceSubmissions } from "@/db/schema";
import { desc, eq, count, and, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function CitationsIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(resourceSubmissions)
        .where(eq(resourceSubmissions.clientId, c.id));
      const [{ value: live }] = await db
        .select({ value: count() })
        .from(resourceSubmissions)
        .where(
          and(
            eq(resourceSubmissions.clientId, c.id),
            inArray(resourceSubmissions.status, ["live", "submitted"]),
          ),
        );

      const napScore = napCompleteness({
        name: c.name,
        address: c.address,
        phone: c.phone,
      });

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary:
          total === 0
            ? `${napScore}% NAP ready`
            : `${live}/${total} live`,
        primaryTone:
          total === 0
            ? napScore >= 100
              ? "emerald"
              : "amber"
            : "violet",
        secondary:
          total === 0
            ? napScore >= 100
              ? "Click to start submissions"
              : "Add address + phone for full local SEO power"
            : `${total} citation${total === 1 ? "" : "s"} tracked`,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Citations & local SEO"
        description="Pick a client to manage their citation submissions across local directories. NAP consistency tracking + 5,000+ pre-loaded directories."
        icon={MapPin}
        accent="emerald"
      />
      <ClientToolGrid cards={cards} basePath="/citations/c" />
    </div>
  );
}

function napCompleteness(c: {
  name: string;
  address: string | null;
  phone: string | null;
}): number {
  let n = 0;
  if (c.name) n += 33;
  if (c.address) n += 34;
  if (c.phone) n += 33;
  return n;
}
