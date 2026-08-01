export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { ProspectFinder } from "./prospect-finder";

export default async function LinkBuildingProspectsPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name, url: clients.url })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/link-building"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to link building
      </Link>

      <PageHeader
        title="Find link prospects"
        description="Free prospecting via DuckDuckGo with the search operators that actually find link opportunities — resource pages, write-for-us pages, directories, competitor mentions. Pick prospects to track them as submissions for the chosen client."
        icon={Search}
        accent="emerald"
      />

      {allClients.length === 0 ? (
        <div className="glass-apple rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          Add a client first.{" "}
          <Link href="/clients" className="underline">
            Manage clients →
          </Link>
        </div>
      ) : (
        <ProspectFinder clients={allClients} />
      )}
    </div>
  );
}
