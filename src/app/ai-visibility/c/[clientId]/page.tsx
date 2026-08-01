export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc, inArray } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, aiVisibilityChecks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { configuredProviders, PROVIDER_CATALOG } from "@/lib/api-keys";
import { getSetting } from "@/lib/settings-store";
import {
  CheckAllButton,
  CheckOneButton,
} from "@/app/ai-visibility/check-buttons";
import { BrowserModeAiToggle } from "@/app/ai-visibility/browser-mode-toggle";
import { clientScope } from "@/lib/client-scope";

const providerLabel: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
  groq: "Groq",
  ollama: "Ollama",
  google_ai_mode: "Google AI Mode",
  copilot: "Microsoft Copilot",
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
    .where(await clientScope())
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

  const browserScrapedEnabled =
    (await getSetting<boolean>("ai_visibility.browser_scraped_enabled")) ??
    false;

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
        description="Track whether AI assistants cite this client's domain when answering tracked queries. Sentiment column shows the tone AI providers use when they DO mention the brand."
        icon={Sparkles}
        accent="rose"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {tracked.length > 0 && (
              <BrowserModeAiToggle initial={browserScrapedEnabled} />
            )}
            {configured.length > 0 && tracked.length > 0 && <CheckAllButton />}
            {checks.length >= 3 && (
              <a
                href={`/tools/geo-swot/c/${client.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-300 hover:bg-rose-500/20"
              >
                Generate GEO SWOT →
              </a>
            )}
          </div>
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
                <th
                  className="px-3 py-3 text-left font-medium"
                  title="Average sentiment of the mentions across AI providers. Positive = brand described favourably; Negative = described unfavourably; Mixed = both."
                >
                  Sentiment
                </th>
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
                // Aggregate sentiment across the checks that DID mention
                // the brand. Prefer the numeric score (-100..+100) when
                // present, fall back to the enum tally otherwise.
                const scored = latest.filter(
                  (r) => r.mentionsDomain && typeof r.sentimentScore === "number",
                );
                let sentimentBadge: { label: string; tone: "emerald" | "rose" | "amber" | "muted"; score: number | null } = {
                  label: "—",
                  tone: "muted",
                  score: null,
                };
                if (scored.length > 0) {
                  const avg = scored.reduce((s, r) => s + (r.sentimentScore ?? 0), 0) / scored.length;
                  sentimentBadge = {
                    label:
                      avg > 30 ? "Positive"
                      : avg < -30 ? "Negative"
                      : "Neutral",
                    tone:
                      avg > 30 ? "emerald"
                      : avg < -30 ? "rose"
                      : "amber",
                    score: Math.round(avg),
                  };
                }
                const sentimentToneClass: Record<string, string> = {
                  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
                  rose: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
                  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
                  muted: "bg-white/5 text-muted-foreground ring-white/10",
                };
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
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${sentimentToneClass[sentimentBadge.tone]}`}
                        title={
                          sentimentBadge.score !== null
                            ? `Avg score ${sentimentBadge.score} on -100..+100 across ${scored.length} mention${scored.length === 1 ? "" : "s"}`
                            : "No mentions with sentiment yet"
                        }
                      >
                        {sentimentBadge.label}
                      </span>
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
                                  ? c.grounding === "live"
                                    ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                                    : // A mention from an ungrounded model is
                                      // not evidence of AI-search visibility —
                                      // don't dress it up in the same green as
                                      // a real cited result.
                                      "bg-amber-500/10 text-amber-300 ring-amber-500/25"
                                  : "bg-white/5 text-muted-foreground ring-white/10"
                              }`}
                              title={
                                c.grounding === "live"
                                  ? c.mentionsDomain
                                    ? "Mentioned — from a live web search"
                                    : "Not mentioned — from a live web search"
                                  : c.mentionsDomain
                                    ? "Mentioned, but this model answered from training data, not a live search. It is not proof you appear in AI search today."
                                    : "Not mentioned. This model answered from training data, not a live search."
                              }
                            >
                              {providerLabel[c.provider] ?? c.provider}
                              {c.grounding !== "live" && (
                                <span aria-hidden className="opacity-60">
                                  ·mem
                                </span>
                              )}
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
