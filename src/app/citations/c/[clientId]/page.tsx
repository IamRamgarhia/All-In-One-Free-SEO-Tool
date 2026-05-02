export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { desc, eq, asc, inArray } from "drizzle-orm";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  MapPin,
  Plus,
} from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  resourceSubmissions,
  seoResources,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { CATEGORY_LABELS } from "@/lib/seo-resources-loader";
import { trackResource, deleteSubmission } from "@/app/link-building/actions";
import { setStatusForm } from "@/app/citations/actions";

const CITATION_CATEGORIES = [
  "local-citation",
  "directory-submission",
  "business-networking",
  "profile-creation",
];

const statusTone: Record<string, string> = {
  pending: "bg-white/5 text-muted-foreground ring-white/10",
  submitted: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  lost: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

const STATUSES = ["pending", "submitted", "live", "rejected", "lost"] as const;

export default async function PerClientCitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { clientId: cidStr } = await params;
  const { category: catParam } = await searchParams;
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

  const activeCategory = CITATION_CATEGORIES.includes(catParam ?? "")
    ? (catParam as string)
    : "local-citation";

  // Tracked submissions for this client (across all categories)
  const submissions = await db
    .select({
      sid: resourceSubmissions.id,
      status: resourceSubmissions.status,
      submittedUrl: resourceSubmissions.submittedUrl,
      submittedAt: resourceSubmissions.submittedAt,
      createdAt: resourceSubmissions.createdAt,
      resourceId: resourceSubmissions.resourceId,
      url: seoResources.url,
      domain: seoResources.domain,
      category: seoResources.category,
      da: seoResources.da,
    })
    .from(resourceSubmissions)
    .leftJoin(
      seoResources,
      eq(resourceSubmissions.resourceId, seoResources.id),
    )
    .where(eq(resourceSubmissions.clientId, clientId))
    .orderBy(desc(resourceSubmissions.createdAt));

  // Available directories in the active category, exclude already-tracked
  const trackedIds = new Set(submissions.map((s) => s.resourceId));
  const directories = await db
    .select()
    .from(seoResources)
    .where(eq(seoResources.category, activeCategory))
    .orderBy(desc(seoResources.da))
    .limit(60);
  const availableDirectories = directories.filter(
    (d) => !trackedIds.has(d.id),
  );

  // Per-category counts for tabs
  const allCats = await db
    .select({ category: seoResources.category })
    .from(seoResources)
    .where(inArray(seoResources.category, CITATION_CATEGORIES));
  const catCounts = new Map<string, number>();
  for (const r of allCats) {
    catCounts.set(r.category, (catCounts.get(r.category) ?? 0) + 1);
  }

  const napScore = napCompleteness(client);
  const napFields = [
    { label: "Name", value: client.name, ok: Boolean(client.name) },
    {
      label: "Address",
      value: client.address ?? "(missing)",
      ok: Boolean(client.address),
    },
    {
      label: "Phone",
      value: client.phone ?? "(missing)",
      ok: Boolean(client.phone),
    },
    {
      label: "Website",
      value: client.url,
      ok: Boolean(client.url),
    },
    {
      label: "Email",
      value: client.email ?? "(missing)",
      ok: Boolean(client.email),
    },
  ];

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
        basePath="/citations/c"
        toolLabel="Citations"
        icon={MapPin}
      />

      <PageHeader
        title={`Citations · ${client.name}`}
        description="Submit consistent NAP info across local citation directories. Tracking which submissions are live + spotting NAP inconsistencies."
        icon={MapPin}
        accent="emerald"
      />

      {/* NAP card — copy-paste ready */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CheckCircle2 className="size-4 text-emerald-300" />
              NAP profile
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Consistent name, address, phone is the #1 ranking factor for
              local SEO. Use these exact values everywhere.
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              napScore === 100
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                : napScore >= 60
                  ? "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                  : "bg-rose-500/10 text-rose-300 ring-rose-500/30"
            }`}
          >
            {napScore}% complete
          </div>
        </header>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {napFields.map((f) => (
            <NapField
              key={f.label}
              label={f.label}
              value={f.value}
              ok={f.ok}
            />
          ))}
        </div>
      </section>

      {/* Tracked submissions */}
      {submissions.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Tracked submissions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              All citations you&apos;ve queued or submitted for {client.name}.
            </p>
          </header>
          <ul className="divide-y divide-white/[0.04]">
            {submissions.map((s) => (
              <li
                key={s.sid}
                className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone[s.status]}`}
                >
                  {s.status}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={s.url ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                  >
                    {s.domain}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                  <div className="text-[11px] text-muted-foreground">
                    {CATEGORY_LABELS[s.category ?? ""] ?? s.category}
                    {s.da !== null && ` · DA ${s.da}`}
                    {s.submittedUrl && ` · live: ${s.submittedUrl}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {STATUSES.filter((st) => st !== s.status).map((st) => {
                    const action = setStatusForm.bind(null, s.sid, st);
                    return (
                      <form key={st} action={action}>
                        <button
                          type="submit"
                          className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                        >
                          → {st}
                        </button>
                      </form>
                    );
                  })}
                  <form action={deleteSubmission.bind(null, s.sid)}>
                    <button
                      type="submit"
                      className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add directories */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">Browse directories</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pre-loaded catalog from your SEO resources. Click + to track a
            submission.
          </p>
          <div className="mt-3 flex flex-wrap gap-1 text-xs">
            {CITATION_CATEGORIES.map((cat) => (
              <a
                key={cat}
                href={`/citations/c/${client.id}?category=${cat}`}
                className={`rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
                  activeCategory === cat
                    ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
                    : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10 hover:text-foreground"
                }`}
              >
                {CATEGORY_LABELS[cat] ?? cat} ({(catCounts.get(cat) ?? 0).toLocaleString()})
              </a>
            ))}
          </div>
        </header>
        {availableDirectories.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No directories left in this category — you&apos;ve tracked them
            all. Pick another tab.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {availableDirectories.map((d) => {
              const trackAction = trackResource.bind(null, d.id, client.id);
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                    >
                      {d.domain}
                      <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                    <div className="text-[11px] text-muted-foreground">
                      {d.da !== null && `DA ${d.da}`}
                      {d.notes && ` · ${d.notes}`}
                    </div>
                  </div>
                  <form action={trackAction}>
                    <button
                      type="submit"
                      title="Track for this client"
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-300"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function napCompleteness(c: {
  name: string;
  address: string | null;
  phone: string | null;
}): number {
  let n = 0;
  if (c.name) n += 33;
  if (c.address) n += 34;
  if (c.phone) n += 33;
  return n;
}

function NapField({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {ok ? (
          <CheckCircle2 className="size-3.5 text-emerald-300" />
        ) : (
          <AlertCircle className="size-3.5 text-rose-300" />
        )}
      </div>
      <div
        className={`mt-1 truncate font-mono text-sm ${ok ? "" : "text-muted-foreground/60"}`}
      >
        {value}
      </div>
      {ok && (
        <CopyValueButton value={value} />
      )}
    </div>
  );
}

function CopyValueButton({ value }: { value: string }) {
  // Server-side, render a simple anchor that selects on triple-click
  return (
    <div
      className="mt-1.5 inline-flex items-center gap-1 rounded text-[10px] uppercase tracking-wider text-muted-foreground"
      title="Triple-click to select"
    >
      <Copy className="size-2.5" />
      {value.length > 0 ? "select to copy" : ""}
    </div>
  );
}
