export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc, inArray } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, aiVisibilityChecks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { configuredProviders, PROVIDER_CATALOG } from "@/lib/api-keys";
import {
  CheckAllButton,
  CheckOneButton,
} from "@/app/ai-visibility/check-buttons";

const providerLabel: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
  groq: "Groq",
  ollama: "Ollama",
};

export default async function PerClientAIVisibilityPage({
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

  const { ids: configured } = await configuredProviders();

  const tracked = await db
    .select()
    .from(keywords)
    .where(eq(keywords.clientId, clientId))
    .orderBy(desc(keywords.createdAt));

  const checks =
    tracked.length === 0
      ? []
      : await db
          .select()
          .from(aiVisibilityChecks)
          .where(
            inArray(
              aiVisibilityChecks.keywordId,
              tracked.map((k) => k.id),
            ),
          )
          .orderBy(desc(aiVisibilityChecks.checkedAt));

  const checksByKeyword = new Map<number, typeof checks>();
  for (const c of checks) {
    const list = checksByKeyword.get(c.keywordId) ?? [];
    list.push(c);
    checksByKeyword.set(c.keywordId, list);
  }

  const totalMentions = checks.filter((c) => c.mentionsDomain).length;

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
        basePath="/ai-visibility/c"
        toolLabel="AI visibility"
        icon={Sparkles}
      />

      <PageHeader
        title={`AI visibility · ${client.name}`}
        description="Track whether AI assistants cite this client's domain when answering tracked queries."
        icon={Sparkles}
        accent="rose"
        actions={
          configured.length > 0 && tracked.length > 0 ? <CheckAllButton /> : undefined
        }
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/20">
              {configured.length}/{PROVIDER_CATALOG.length} providers configured
            </span>
            {totalMentions > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                {totalMentions} mentions logged
              </span>
            )}
          </div>
        }
      />

      {tracked.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No keywords tracked yet for this client. Go to{" "}
          <a
            href={`/keywords/c/${client.id}`}
            className="text-violet-300 hover:underline"
          >
            Keywords
          </a>{" "}
          to add some — AI visibility checks run against tracked keywords.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Query</th>
                <th className="px-3 py-3 text-left font-medium">Mentions</th>
                <th className="px-3 py-3 text-left font-medium">Latest checks</th>
                <th className="px-3 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracked.map((k) => {
                const all = checksByKeyword.get(k.id) ?? [];
                const latestByProvider = new Map<string, (typeof all)[number]>();
                for (const r of all) {
                  if (!latestByProvider.has(r.provider))
                    latestByProvider.set(r.provider, r);
                }
                const latest = Array.from(latestByProvider.values());
                const mentions = latest.filter((r) => r.mentionsDomain).length;
                return (
                  <tr key={k.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3 font-medium">{k.query}</td>
                    <td className="px-3 py-3">
                      {mentions > 0 ? (
                        <span className="inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                          {mentions}/{latest.length}
                        </span>
                      ) : latest.length > 0 ? (
                        <span className="inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">
                          0/{latest.length}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {latest.length === 0 ? (
                        <span className="text-muted-foreground">No checks yet</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {latest.map((c) => (
                            <span
                              key={c.id}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ring-1 ring-inset ${
                                c.mentionsDomain
                                  ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                                  : "bg-white/5 text-muted-foreground ring-white/10"
                              }`}
                              title={c.mentionsDomain ? "Mentioned" : "Not mentioned"}
                            >
                              {providerLabel[c.provider] ?? c.provider}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <CheckOneButton keywordId={k.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
