export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { Users } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { AuthorAuthorityClient } from "./client";

export default async function AuthorAuthorityIndexPage() {
  const all = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Author topic-authority tracker"
        description="Scan a competitor or partner domain. We crawl /author/ pages, score each named author on E-E-A-T signals (bio depth, credentials, sameAs profiles, post volume, topic match) and surface high-authority authors you should reach out to or benchmark against."
        icon={Users}
        accent="cyan"
      />
      <AuthorAuthorityClient clients={all} />
    </div>
  );
}
