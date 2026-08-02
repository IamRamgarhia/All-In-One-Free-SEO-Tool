export const dynamic = "force-dynamic";

import { asc, desc, inArray } from "drizzle-orm";
import { FileSignature } from "lucide-react";
import { db } from "@/db/client";
import { clients, graderLeads, proposals } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { currentUser, visibleClientIds } from "@/lib/auth";
import { ProposalsManager } from "./manager";

export default async function ProposalsPage() {
  const visible = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const scope = await visibleClientIds(await currentUser());

  // Proposals attached to a client the caller can't see must not appear.
  // Ones with no client (built straight from a lead) are workspace-wide.
  const rows = await db
    .select()
    .from(proposals)
    .orderBy(desc(proposals.createdAt))
    .limit(100);
  const mine =
    scope === null
      ? rows
      : rows.filter((p) => p.clientId === null || scope.includes(p.clientId));

  // Leads worth pitching: someone left an email and hasn't been won yet.
  const leads = await db
    .select({
      id: graderLeads.id,
      url: graderLeads.url,
      name: graderLeads.name,
      email: graderLeads.email,
      score: graderLeads.score,
    })
    .from(graderLeads)
    .where(inArray(graderLeads.status, ["new", "contacted"]))
    .orderBy(desc(graderLeads.createdAt))
    .limit(50);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Proposals"
        description="Turn an audit into a document someone signs. The scope comes from what the audit actually found — you set the price."
        icon={FileSignature}
        accent="violet"
      />
      <ProposalsManager
        clients={visible}
        leads={leads.filter((l) => l.email)}
        proposals={mine.map((p) => ({
          id: p.id,
          prospectName: p.prospectName,
          prospectUrl: p.prospectUrl,
          title: p.title,
          intro: p.intro,
          terms: p.terms,
          currency: p.currency,
          scope: p.scopeJson ?? [],
          pricing: p.pricingJson ?? [],
          status: p.status,
          basedOnScore: p.basedOnScore,
          createdAt: p.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
