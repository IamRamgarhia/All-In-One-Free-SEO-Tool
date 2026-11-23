export const dynamic = "force-dynamic";

import { getTranslations, getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { ExternalLink, Link2, MousePointerClick, X } from "lucide-react";
import { db } from "@/db/client";
import { clients, shortLinks } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { CreateLinkForm } from "./create-form";
import { CsvImportForm } from "./csv-import-form";
import { CopyButton } from "./copy-button";
import { deleteShortLink } from "./actions";

export default async function ShortLinksPage() {
  const tx = await getTranslations("ui.app_links_page");
  const locale = await getLocale();
  const [allClients, links, h] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(await clientScope())
      .orderBy(asc(clients.name)),
    db.select().from(shortLinks).orderBy(desc(shortLinks.createdAt)).limit(200),
    headers(),
  ]);

  // Detect host so we can render absolute /r/ URLs the user can copy
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const clientName = new Map(allClients.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={tx("smartLinks")}
        description={tx("selfHostedShortLinksWith")}
        icon={Link2}
        accent="cyan"
      />

      <CreateLinkForm clients={allClients} />

      <CsvImportForm clients={allClients} />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">
            {tx("activeLinks", { length: links.length })}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tx.rich("clickCountUpdatesInstantlyOn", { origin, b0: (chunks) => <code className="rounded bg-white/5 px-1.5 py-0.5">{chunks}</code> })}
          </p>
        </header>
        {links.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {tx("noLinksYetCreateOne")}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {links.map((l) => {
              const fullUrl = `${origin}/r/${l.slug}`;
              return (
                <li key={l.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {l.label && (
                          <span className="font-medium">{l.label}</span>
                        )}
                        <a
                          href={fullUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/20"
                        >
                          /r/{l.slug}
                          <ExternalLink className="size-3 opacity-60" />
                        </a>
                        <CopyButton text={fullUrl} />
                        {l.clientId && (
                          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                            {clientName.get(l.clientId) ??
                              tx("client", { clientId: l.clientId })}
                          </span>
                        )}
                      </div>
                      <a
                        href={l.destination}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block truncate text-[11px] font-mono text-muted-foreground hover:text-foreground hover:underline"
                      >
                        → {l.destination}
                      </a>
                      {(l.utmSource ||
                        l.utmMedium ||
                        l.utmCampaign ||
                        l.utmTerm ||
                        l.utmContent) && (
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {l.utmSource && (
                            <code className="rounded bg-white/5 px-1.5 py-0.5">
                              {tx("source", { utmSource: l.utmSource })}
                            </code>
                          )}
                          {l.utmMedium && (
                            <code className="rounded bg-white/5 px-1.5 py-0.5">
                              {tx("medium", { utmMedium: l.utmMedium })}
                            </code>
                          )}
                          {l.utmCampaign && (
                            <code className="rounded bg-white/5 px-1.5 py-0.5">
                              {tx("campaign", { utmCampaign: l.utmCampaign })}
                            </code>
                          )}
                          {l.utmTerm && (
                            <code className="rounded bg-white/5 px-1.5 py-0.5">
                              {tx("term", { utmTerm: l.utmTerm })}
                            </code>
                          )}
                          {l.utmContent && (
                            <code className="rounded bg-white/5 px-1.5 py-0.5">
                              {tx("content", { utmContent: l.utmContent })}
                            </code>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        <MousePointerClick className="size-3" />
                        {l.clickCount}
                      </div>
                      {l.lastClickAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {tx("last", { v: l.lastClickAt.toLocaleDateString(locale) })}
                        </span>
                      )}
                      <form action={deleteShortLink.bind(null, l.id)}>
                        <button
                          type="submit"
                          aria-label={tx("delete")}
                          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <X className="size-3.5" />
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
