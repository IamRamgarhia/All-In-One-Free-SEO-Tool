export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc } from "drizzle-orm";
import { FileText, ExternalLink } from "lucide-react";
import { db } from "@/db/client";
import { clients, contentBriefs } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { GenerateBriefForm } from "@/app/content/generate-form";
import { deleteBrief, setBriefStatus } from "@/app/content/actions";

const statusTone: Record<string, string> = {
  idea: "bg-white/5 text-muted-foreground ring-white/10",
  outline: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  draft: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  review: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

const NEXT: Record<string, string | null> = {
  idea: "outline",
  outline: "draft",
  draft: "review",
  review: "published",
  published: null,
};

export default async function PerClientContentPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.clientId, clientId))
    .orderBy(desc(contentBriefs.createdAt));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/content/c"
        toolLabel="Content"
        icon={FileText}
      />

      <PageHeader
        title={`Content briefs · ${client.name}`}
        description="Generate AI content briefs from real SERP scraping + heading aggregation. Track them through draft → review → published."
        icon={FileText}
        accent="emerald"
      />

      <GenerateBriefForm clients={[{ id: client.id, name: client.name }]} />

      {briefs.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No briefs yet. Generate the first one above.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <ul className="divide-y divide-white/5">
            {briefs.map((b) => {
              const next = NEXT[b.status];
              const advance = next
                ? setBriefStatus.bind(null, b.id, next as "outline" | "draft" | "review" | "published")
                : null;
              const remove = deleteBrief.bind(null, b.id);
              return (
                <li key={b.id} className="px-5 py-4 transition-colors hover:bg-white/[0.03]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{b.title}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone[b.status]}`}
                        >
                          {b.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Target keyword:{" "}
                        <code className="rounded bg-white/5 px-1.5 py-0.5">
                          {b.targetKeyword}
                        </code>
                        {b.targetWordCount && ` · ~${b.targetWordCount} words`}
                      </div>
                      {b.publishedUrl && (
                        <a
                          href={b.publishedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {b.publishedUrl.replace(/^https?:\/\//, "")}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {advance && next && (
                        <form action={advance}>
                          <button
                            type="submit"
                            className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                          >
                            → {next}
                          </button>
                        </form>
                      )}
                      <form action={remove}>
                        <button
                          type="submit"
                          className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          remove
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
