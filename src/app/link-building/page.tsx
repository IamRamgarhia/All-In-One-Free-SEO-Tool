import { getTranslations, getLocale } from "next-intl/server";
import type { Tx } from "@/lib/tx";
import Link from "next/link";
import { and, asc, count, desc, eq, gte, like, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  Link2,
  ExternalLink,
  Search as SearchIcon,
  X,
  Filter,
  CheckCircle2,
  Send,
  Eye,
  XCircle,
  Compass,
} from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  resourceSubmissions,
  seoResources,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import {
  CATEGORY_LABELS,
  ensureSeoResourcesSeeded,
} from "@/lib/seo-resources-loader";
import { TrackResourceButton } from "./track-button";
import {
  deleteSubmission,
  setSubmissionStatus,
  setSubmittedUrl,
} from "./actions";

type SearchParams = {
  q?: string;
  category?: string;
  minDa?: string;
  client?: string;
};

const PAGE_SIZE = 50;

const statusConfig = (tx: Tx): Record<
  string,
  { label: string; tone: string; icon: typeof Send }
> => ({
  pending: {
    label: tx("pending"),
    tone: "bg-white/5 text-muted-foreground ring-white/10",
    icon: Send,
  },
  submitted: {
    label: tx("submitted"),
    tone: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    icon: Send,
  },
  live: {
    label: tx("live"),
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    icon: CheckCircle2,
  },
  rejected: {
    label: tx("rejected"),
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    icon: XCircle,
  },
  lost: {
    label: tx("lost"),
    tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    icon: Eye,
  },
});

export default async function LinkBuildingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const total = await ensureSeoResourcesSeeded();
  const tx = await getTranslations("ui.app_link-building_page");
  const locale = await getLocale();

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const category = sp.category ?? "";
  const minDa = sp.minDa ? Number(sp.minDa) : 0;
  const filterClientId = sp.client ? Number(sp.client) : null;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  // Per-category counts (fast aggregate)
  const categoryCounts = await db
    .select({
      category: seoResources.category,
      n: count(),
    })
    .from(seoResources)
    .groupBy(seoResources.category);
  const countsMap = new Map(categoryCounts.map((r) => [r.category, r.n]));

  // Build resource query
  const conditions = [];
  if (category) conditions.push(eq(seoResources.category, category));
  if (minDa > 0) conditions.push(gte(seoResources.da, minDa));
  if (q) {
    conditions.push(
      or(like(seoResources.url, `%${q}%`), like(seoResources.domain, `%${q}%`)),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const resources = await db
    .select()
    .from(seoResources)
    .where(where)
    .orderBy(desc(seoResources.da), asc(seoResources.alexa))
    .limit(PAGE_SIZE);

  // Pull tracked-by-client mapping for visible resources
  const visibleIds = resources.map((r) => r.id);
  const trackedRows =
    visibleIds.length > 0
      ? await db
          .select({
            resourceId: resourceSubmissions.resourceId,
            clientId: resourceSubmissions.clientId,
          })
          .from(resourceSubmissions)
      : [];
  const trackedByResource = new Map<number, number[]>();
  for (const r of trackedRows) {
    if (!visibleIds.includes(r.resourceId)) continue;
    const list = trackedByResource.get(r.resourceId) ?? [];
    list.push(r.clientId);
    trackedByResource.set(r.resourceId, list);
  }

  // Pull active submissions for the right-side panel
  const submissionsQuery = db
    .select({
      id: resourceSubmissions.id,
      status: resourceSubmissions.status,
      submittedUrl: resourceSubmissions.submittedUrl,
      submittedAt: resourceSubmissions.submittedAt,
      createdAt: resourceSubmissions.createdAt,
      resourceId: seoResources.id,
      url: seoResources.url,
      domain: seoResources.domain,
      category: seoResources.category,
      da: seoResources.da,
      clientId: clients.id,
      clientName: clients.name,
    })
    .from(resourceSubmissions)
    .leftJoin(seoResources, eq(resourceSubmissions.resourceId, seoResources.id))
    .leftJoin(clients, eq(resourceSubmissions.clientId, clients.id))
    .orderBy(desc(resourceSubmissions.createdAt))
    .limit(50);
  const submissions = filterClientId
    ? await submissionsQuery.where(
        eq(resourceSubmissions.clientId, filterClientId),
      )
    : await submissionsQuery;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={tx("linkBuilding")}
        description={tx("curatedDatabaseOfSitesAcross", { total: total.toLocaleString(locale), size: countsMap.size })}
        icon={Link2}
        accent="emerald"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              {tx("resources", { total: total.toLocaleString(locale) })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
              {tx("tracked", { length: trackedRows.length })}
            </span>
            <Link
              href="/link-building/prospects"
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
            >
              <Compass className="size-3" />
              {tx("findNewProspects")}
            </Link>
            <Link
              href="/link-building/library"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
            >
              <ExternalLink className="size-3" />
              {tx("curatedLibrary30Countries")}
            </Link>
          </div>
        }
      />

      {/* Filter form */}
      <form
        method="get"
        className="rounded-2xl border border-white/5 bg-card/40 p-4 backdrop-blur-md"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              placeholder={tx("searchByDomainOrUrl")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <select
            name="category"
            defaultValue={category}
            className="flex h-9 rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            <option value="">{tx("allCategories")}</option>
            {Array.from(countsMap.entries())
              .sort((a, b) =>
                (CATEGORY_LABELS[a[0]] ?? a[0]).localeCompare(
                  CATEGORY_LABELS[b[0]] ?? b[0],
                ),
              )
              .map(([cat, n]) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] ?? cat} ({n.toLocaleString(locale)})
                </option>
              ))}
          </select>
          <select
            name="minDa"
            defaultValue={String(minDa)}
            className="flex h-9 rounded-md border border-white/10 bg-card/60 px-3 text-sm"
          >
            <option value="0">{tx("anyDa")}</option>
            <option value="20">{tx("da20")}</option>
            <option value="40">{tx("da40")}</option>
            <option value="60">{tx("da60")}</option>
            <option value="80">{tx("da80")}</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
          >
            <Filter className="size-3.5" />
            {tx("apply")}
          </button>
        </div>
      </form>

      {/* Resources list */}
      <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <header className="border-b border-white/5 px-5 py-3">
          <h2 className="text-sm font-semibold">{tx("browseResources")}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {tx("showingOf", { length: resources.length })}
            {(where ? "filtered" : "total")}{tx("sortedByDaDescending", { total: total.toLocaleString(locale) })}
          </p>
        </header>
        {resources.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-muted-foreground">
            {tx("noResourcesMatchTryClearing")}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {resources.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]"
              >
                <div className="min-w-0 space-y-0.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                  >
                    {r.domain}
                    <ExternalLink className="size-3 opacity-60" />
                  </a>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10">
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </span>
                    {r.da !== null && (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
                        {tx("da", { da: r.da })}
                      </span>
                    )}
                    {r.alexa !== null && (
                      <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
                        {tx("alexa", { v: r.alexa.toLocaleString(locale) })}
                      </span>
                    )}
                  </div>
                </div>
                <TrackResourceButton
                  resourceId={r.id}
                  clients={allClients}
                  alreadyTrackedClientIds={
                    trackedByResource.get(r.id) ?? []
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Submissions panel */}
      {submissions.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold">{tx("trackedSubmissions")}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {tx("activeAcrossYourClients", { length: submissions.length })}
              </p>
            </div>
            {filterClientId !== null && (
              <Link
                href="/link-building"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                <X className="size-3" />
                {tx("clearClientFilter")}
              </Link>
            )}
          </header>
          <ul className="divide-y divide-white/5">
            {submissions.map((s) => {
              const cfg = statusConfig(tx)[s.status] ?? statusConfig(tx).pending;
              const Icon = cfg.icon;
              const removeAction = deleteSubmission.bind(null, s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${cfg.tone}`}
                  >
                    <Icon className="size-2.5" />
                    {cfg.label}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium">{s.domain ?? "—"}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      {s.clientName && s.clientId && (
                        <Link
                          href={`/clients/${s.clientId}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {s.clientName}
                        </Link>
                      )}
                      <span>
                        {CATEGORY_LABELS[s.category ?? ""] ?? s.category}
                      </span>
                      {s.da !== null && <span>{tx("da2", { da: s.da })}</span>}
                      {s.submittedAt && (
                        <span>
                          · {s.status} {s.submittedAt.toLocaleDateString(locale)}
                        </span>
                      )}
                    </div>
                    {s.submittedUrl && (
                      <a
                        href={s.submittedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-emerald-300 hover:underline"
                      >
                        {tx("live2", { v: s.submittedUrl.replace(/^https?:\/\//, "").slice(0, 60) })}
                      </a>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {s.status === "pending" && (
                      <form
                        action={setSubmissionStatus.bind(
                          null,
                          s.id,
                          "submitted",
                          undefined,
                        )}
                      >
                        <button
                          type="submit"
                          className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
                        >
                          {tx("markSubmitted")}
                        </button>
                      </form>
                    )}
                    {(s.status === "submitted" || s.status === "pending") && (
                      <form
                        action={setSubmittedUrl.bind(null, s.id)}
                        className="flex items-center gap-1"
                      >
                        <input
                          name="submittedUrl"
                          placeholder={tx("liveUrl")}
                          defaultValue={s.submittedUrl ?? ""}
                          className="h-6 w-32 rounded-md border border-white/10 bg-card/60 px-2 text-[10px]"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
                          title={tx("markLive")}
                        >
                          {tx("live")}
                        </button>
                      </form>
                    )}
                    <form action={removeAction}>
                      <button
                        type="submit"
                        aria-label={tx("delete")}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <X className="size-3" />
                      </button>
                    </form>
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
