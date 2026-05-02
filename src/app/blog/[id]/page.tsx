export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Wand2 } from "lucide-react";
import { db } from "@/db/client";
import { clients, contentBriefs } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { getGscQuickWins } from "@/lib/google-data";
import {
  suggestTopicsFromQuickWins,
  suggestTopicsFromNiche,
} from "@/lib/blog-writer";
import { BlogWriterForm } from "./blog-writer-form";

export default async function BlogClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  // Real GSC quick wins → strongest topic suggestions
  let quickWinSuggestions: ReturnType<typeof suggestTopicsFromQuickWins> = [];
  if (client.gscProperty) {
    const wins = await getGscQuickWins({
      siteUrl: client.gscProperty,
      days: 28,
      limit: 6,
      minImpressions: 30,
    });
    quickWinSuggestions = suggestTopicsFromQuickWins(wins);
  }
  const nicheSuggestions = suggestTopicsFromNiche(client.niche, client.name);
  const suggestions = [...quickWinSuggestions, ...nicheSuggestions].slice(0, 10);

  // Recent saved drafts for context
  const drafts = await db
    .select()
    .from(contentBriefs)
    .where(eq(contentBriefs.clientId, clientId))
    .orderBy(desc(contentBriefs.createdAt))
    .limit(5);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/blog"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        All clients
      </Link>

      <PageHeader
        title={`Write for ${client.name}`}
        description={
          client.description ??
          `Generate an SEO-friendly blog post tailored to ${client.name}'s niche, tech stack, and real keyword data.`
        }
        icon={Wand2}
        accent="violet"
        crumbs={[
          { label: "AI blog", href: "/blog" },
          { label: client.name },
        ]}
        actions={
          <Link
            href={`/clients/${client.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
          >
            Open client
            <ExternalLink className="size-3.5" />
          </Link>
        }
      />

      <BlogWriterForm
        clientId={client.id}
        clientName={client.name}
        suggestions={suggestions}
      />

      {drafts.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Recent drafts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved blog posts for this client.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.04]">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Target: {d.targetKeyword} · Status: {d.status} ·{" "}
                    {d.createdAt.toLocaleDateString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
