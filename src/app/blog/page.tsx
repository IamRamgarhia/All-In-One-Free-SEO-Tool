export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc } from "drizzle-orm";
import {
  ArrowUpRight,
  Globe,
  PencilLine,
  Sparkles,
  Wand2,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";

export default async function BlogIndexPage() {
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));
  const active = await getActiveProvider();
  const { byId } = await configuredProviders();
  const aiReady = Boolean(active && byId[active]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="AI blog posts"
        description="Pick a client. We pull their tech stack, niche, and real Search Console data — then your active AI writes a search-friendly draft you can edit and ship."
        icon={Wand2}
        accent="violet"
      />

      {!aiReady && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          <strong>No AI provider configured.</strong> Add a free API key (Gemini,
          Groq, or OpenRouter) in{" "}
          <Link
            href="/settings"
            className="text-amber-100 underline-offset-2 hover:underline"
          >
            Settings → AI provider keys
          </Link>{" "}
          to start drafting posts.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <ClientCard key={c.id} client={c} aiReady={aiReady} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-14 text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <Globe className="size-6 text-violet-300" />
        </div>
        <h2 className="text-xl font-semibold">Add a client first</h2>
        <p className="text-sm text-muted-foreground">
          Each blog post is written for a specific client&apos;s niche, tech
          stack, and real keyword data.
        </p>
        <Link
          href="/clients/new"
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90"
        >
          Add client
        </Link>
      </div>
    </div>
  );
}

function ClientCard({
  client,
  aiReady,
}: {
  client: typeof clients.$inferSelect;
  aiReady: boolean;
}) {
  const hasGsc = Boolean(client.gscProperty);
  return (
    <Link
      href={`/blog/${client.id}`}
      className="glass-apple lift-on-hover group relative block overflow-hidden rounded-2xl p-5 transition-all"
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-violet-500/15 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{client.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {client.url.replace(/^https?:\/\//, "")}
            </div>
          </div>
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={client.logoUrl}
              alt=""
              className="size-10 shrink-0 rounded-lg border border-white/10 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-sm font-bold text-violet-300 ring-1 ring-violet-400/30">
              {client.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {client.niche && (
            <span className="rounded-full bg-white/5 px-2 py-0.5 ring-1 ring-inset ring-white/10">
              {client.niche}
            </span>
          )}
          {hasGsc && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <Sparkles className="size-2.5" />
              GSC linked
            </span>
          )}
        </div>

        <div className="pt-1 text-xs text-muted-foreground">
          {hasGsc ? (
            <>Topic suggestions ready from real keyword data.</>
          ) : (
            <>Pick a target keyword — AI handles the rest.</>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm font-medium text-violet-300">
          <PencilLine className="size-4" />
          {aiReady ? "Write with AI" : "Set up AI to start"}
          <ArrowUpRight className="ml-auto size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>
    </Link>
  );
}
