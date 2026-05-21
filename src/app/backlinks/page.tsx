export const dynamic = "force-dynamic";

import { Link2 } from "lucide-react";
import { db } from "@/db/client";
import { backlinks, clients } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";

export default async function BacklinksIndexPage() {
  const all = await db.select().from(clients).orderBy(desc(clients.createdAt));

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: total }] = await db
        .select({ value: count() })
        .from(backlinks)
        .where(eq(backlinks.clientId, c.id));
      const [{ value: active }] = await db
        .select({ value: count() })
        .from(backlinks)
        .where(
          and(eq(backlinks.clientId, c.id), eq(backlinks.status, "active")),
        );
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary: total === 0 ? "None tracked" : `${total} link${total === 1 ? "" : "s"}`,
        primaryTone: total > 0 ? "emerald" : "neutral",
        secondary: total > 0 ? `${active} active` : "Click to add the first",
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Backlinks"
        description="Pick a client to manage their backlink profile, mark lost/disavow, and generate disavow files."
        icon={Link2}
        accent="emerald"
        actions={
          <a
            href="/backlinks/export.csv"
            className="inline-flex h-9 items-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            Export CSV
          </a>
        }
      />

      {/* Honesty banner. Free-tier backlink indexes will NEVER match
          Ahrefs / Semrush / Majestic — those crawl the open web with
          dedicated infrastructure and decade-long historical indexes.
          Surface that fact at the top of the tool so the user
          calibrates expectations: pair with GSC + Ahrefs Webmaster
          Tools (also free) for full coverage. */}
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12px]">
        <div className="font-semibold text-amber-300">
          Honest about what this shows
        </div>
        <p className="mt-1 leading-relaxed text-amber-200/80">
          Backlink data here comes from Google Search Console (your own
          site&apos;s confirmed inbound links) plus Common Crawl
          extraction. It is intentionally narrower than a paid index
          like Ahrefs or Semrush — building one of those at scale costs
          millions per year. For comprehensive coverage, pair this with{" "}
          <a
            href="https://ahrefs.com/webmaster-tools"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-amber-100"
          >
            Ahrefs Webmaster Tools
          </a>{" "}
          (free for verified site owners) and import the CSV here.
        </p>
      </section>

      <ClientToolGrid cards={cards} basePath="/backlinks/c" />
    </div>
  );
}
