export const dynamic = "force-dynamic";

import { Bot } from "lucide-react";
import { db } from "@/db/client";
import { clients, aiSuggestions } from "@/db/schema";
import { desc, eq, count, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import {
  ClientToolGrid,
  type ClientToolCard,
} from "@/components/shell/client-tool-grid";
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";
import { markSectionSeen } from "@/lib/unread-counts";

export default async function AgentIndexPage() {
  await markSectionSeen("suggestions").catch(() => {});
  const all = await db
    .select()
    .from(clients)
    .orderBy(desc(clients.createdAt))
    .limit(500);
  const active = await getActiveProvider();
  const { byId } = await configuredProviders();
  const aiReady = Boolean(active && byId[active]);

  const cards: ClientToolCard[] = await Promise.all(
    all.map(async (c) => {
      const [{ value: pending }] = await db
        .select({ value: count() })
        .from(aiSuggestions)
        .where(
          and(
            eq(aiSuggestions.clientId, c.id),
            eq(aiSuggestions.status, "new"),
          ),
        );
      const [{ value: applied }] = await db
        .select({ value: count() })
        .from(aiSuggestions)
        .where(
          and(
            eq(aiSuggestions.clientId, c.id),
            eq(aiSuggestions.status, "applied"),
          ),
        );

      return {
        id: c.id,
        name: c.name,
        url: c.url,
        logoUrl: c.logoUrl,
        niche: c.niche,
        primary:
          pending === 0
            ? applied > 0
              ? "All addressed"
              : "Ready to run"
            : `${pending} suggestion${pending === 1 ? "" : "s"}`,
        primaryTone: pending > 0 ? "violet" : applied > 0 ? "emerald" : "neutral",
        secondary:
          applied > 0
            ? `${applied} applied so far`
            : pending > 0
              ? "Click to review and apply"
              : "Click to run the agent",
        badges:
          pending > 0
            ? [{ label: `${pending} pending`, tone: "violet" as const }]
            : undefined,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="AI agent"
        description="Pick a client. The agent reads their audit findings + Search Console data, then drafts concrete title rewrites, meta descriptions, quick-win actions, and content ideas — using your active AI provider."
        icon={Bot}
        accent="violet"
      />

      {!aiReady && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          <strong>No AI provider configured.</strong> Add a free API key
          (Gemini, Groq, or OpenRouter) in{" "}
          <a
            href="/settings"
            className="text-amber-100 underline-offset-2 hover:underline"
          >
            Settings → AI provider keys
          </a>{" "}
          to start running the agent.
        </div>
      )}

      <ClientToolGrid cards={cards} basePath="/agent/c" />
    </div>
  );
}
