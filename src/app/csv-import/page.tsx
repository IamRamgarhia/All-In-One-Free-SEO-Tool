export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import { FileUp } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { CsvImportClient } from "./csv-import-client";

export default async function CsvImportPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="CSV import"
        description="Drag any CSV — clients, keywords, outreach prospects, competitors. We auto-detect what it is from the headers and bulk-import. Paste from Ahrefs, Semrush, GSC, Surfer, or anywhere else."
        icon={FileUp}
        accent="cyan"
      />
      <CsvImportClient clients={allClients} />

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <h2 className="text-base font-semibold">What gets detected</h2>
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 text-left font-medium">Type</th>
              <th className="py-2 text-left font-medium">Required headers</th>
              <th className="py-2 text-left font-medium">Optional headers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04] text-muted-foreground">
            <tr>
              <td className="py-2 font-mono text-foreground">clients</td>
              <td className="py-2">
                <code>url</code> (or <code>website</code> / <code>domain</code>) +{" "}
                <code>name</code>
              </td>
              <td className="py-2">
                <code>niche</code> (local / ecommerce / saas / blog / services)
              </td>
            </tr>
            <tr>
              <td className="py-2 font-mono text-foreground">keywords</td>
              <td className="py-2">
                <code>keyword</code> (or <code>query</code>)
              </td>
              <td className="py-2">
                <code>country</code>, <code>device</code>
              </td>
            </tr>
            <tr>
              <td className="py-2 font-mono text-foreground">outreach</td>
              <td className="py-2">
                <code>email</code> + <code>status</code>
              </td>
              <td className="py-2">
                <code>name</code>, <code>url</code>, <code>notes</code>
              </td>
            </tr>
            <tr>
              <td className="py-2 font-mono text-foreground">competitors</td>
              <td className="py-2">
                <code>competitor url</code> (or <code>url</code>)
              </td>
              <td className="py-2">
                <code>name</code>, <code>notes</code>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
