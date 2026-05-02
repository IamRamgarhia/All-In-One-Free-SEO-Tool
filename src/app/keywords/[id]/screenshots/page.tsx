import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

import { Camera, ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, serpScreenshots } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";

export default async function KeywordScreenshotsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const keywordId = Number(id);
  if (!Number.isFinite(keywordId)) notFound();

  const [keyword] = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(eq(keywords.id, keywordId))
    .limit(1);
  if (!keyword) notFound();

  const shots = await db
    .select()
    .from(serpScreenshots)
    .where(eq(serpScreenshots.keywordId, keywordId))
    .orderBy(desc(serpScreenshots.capturedAt));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="SERP screenshots"
        description={`History of search-results-page captures for "${keyword.query}". Visual evidence of how the SERP looked at each rank check.`}
        icon={Camera}
        accent="fuchsia"
        crumbs={[
          { label: "Keywords", href: "/keywords" },
          { label: keyword.query },
        ]}
        actions={
          <Link
            href="/keywords"
            className="inline-flex h-9 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-3 text-xs hover:bg-white/10"
          >
            <ArrowLeft className="size-3.5" />
            Back to keywords
          </Link>
        }
      />

      {shots.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No screenshots yet. The first time you check this keyword&apos;s rank,
          we capture a SERP screenshot. Subsequent captures happen on
          significant position changes.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shots.map((s) => (
            <div
              key={s.id}
              className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
            >
              <a
                href={`/screenshots/${s.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/screenshots/${s.id}`}
                  alt={`SERP for ${keyword.query} on ${s.capturedAt.toLocaleDateString()}`}
                  className="aspect-[4/3] w-full object-cover object-top transition-opacity hover:opacity-90"
                  loading="lazy"
                />
              </a>
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <div>
                  <div className="font-medium">
                    {s.capturedAt.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground">
                    Position: {s.position ?? "—"}
                  </div>
                </div>
                <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30">
                  SERP
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
