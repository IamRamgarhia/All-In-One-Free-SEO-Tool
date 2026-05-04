export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Circle,
  ExternalLink,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { GbpRunner } from "./gbp-runner";
import { GbpPostComposer } from "./post-composer";
import { playbookFor, scoreGbpProfile } from "@/lib/gbp-playbook";
import { ClientInfoCard } from "@/components/client-info-card";
import {
  getCompletionsForClient,
  togglePlaybookItem,
} from "./playbook-actions";

export default async function PerClientGbpPage({
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

  if (!client.gbpUrl) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/gbp"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          All clients
        </Link>
        <PageHeader
          title={`GBP · ${client.name}`}
          description="Add the Google Maps share link in client settings to enable scraping."
          icon={Building}
          accent="cyan"
        />
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No Google Business Profile URL on this client yet.
          </p>
          <Link
            href={`/clients/${client.id}/edit`}
            className="mt-3 inline-flex items-center gap-1 text-sm text-violet-300 hover:underline"
          >
            Add it on the edit page
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/gbp/c"
        toolLabel="GBP"
        icon={Building}
      />

      <PageHeader
        title={`GBP · ${client.name}`}
        description="Pull the public Google Business Profile, see recent reviews, draft AI replies you can paste into GBP."
        icon={Building}
        accent="cyan"
      />

      <ClientInfoCard
        info={{
          name: client.name,
          url: client.url,
          email: client.email,
          phone: client.phone,
          address: client.address,
          description: client.description,
          city: client.city,
          country: client.country,
          businessType: client.businessType,
          shortDescription: client.description?.split(".")[0] ?? null,
        }}
      />

      <GbpRunner clientId={client.id} clientName={client.name} />

      <GbpPostComposer
        clientId={client.id}
        clientName={client.name}
        niche={client.niche}
        city={client.city}
      />

      <GbpPlaybookSection
        clientId={client.id}
        niche={client.niche}
        gbpScore={
          scoreGbpProfile({
            hasGbpUrl: Boolean(client.gbpUrl),
            hasAddress: Boolean(client.address),
            hasPhone: Boolean(client.phone),
            hasHours: false,
            reviewCount: null,
            ratingAverage: null,
          }).score
        }
        completions={await getCompletionsForClient(client.id)}
      />
    </div>
  );
}

function GbpPlaybookSection({
  clientId,
  niche,
  gbpScore,
  completions,
}: {
  clientId: number;
  niche: "local" | "ecommerce" | "saas" | "blog" | "services" | null;
  gbpScore: number;
  completions: {
    oncePermanent: Set<string>;
    weekly: Set<string>;
    monthly: Set<string>;
    quarterly: Set<string>;
  };
}) {
  const items = playbookFor(niche);
  const cadenceTone: Record<string, string> = {
    once: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
    weekly: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    monthly: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    quarterly: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  };
  function isDone(id: string, cadence: "once" | "weekly" | "monthly" | "quarterly") {
    if (cadence === "once") return completions.oncePermanent.has(id);
    if (cadence === "weekly") return completions.weekly.has(id);
    if (cadence === "monthly") return completions.monthly.has(id);
    return completions.quarterly.has(id);
  }
  const total = items.length;
  const doneCount = items.filter((i) => isDone(i.id, i.cadence)).length;
  const completionPct = Math.round((doneCount / total) * 100);

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">
            GBP optimization playbook ({doneCount}/{total} done · {completionPct}%)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Profile signal score: {gbpScore}/100. Tick items as you finish
            them — once-only items stay ticked, recurring items reset for
            the next period.
          </p>
        </div>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {items.map((p) => {
          const done = isDone(p.id, p.cadence);
          const toggleAction = togglePlaybookItem.bind(null, clientId, p.id, p.cadence);
          return (
          <li key={p.id} className={`px-5 py-4 ${done ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <form action={toggleAction}>
                  <button
                    type="submit"
                    aria-label={done ? "Mark not done" : "Mark done"}
                    className="mt-0.5 grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:text-emerald-300"
                  >
                    {done ? (
                      <CheckCircle2 className="size-5 text-emerald-300" />
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </button>
                </form>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
                      {p.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${cadenceTone[p.cadence]}`}
                    >
                      {p.cadence}
                    </span>
                    <span className="text-amber-300 text-[10px]">
                      {"★".repeat(p.weight)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.whyItMatters}
                  </p>
                  <p className="mt-1.5 text-xs">
                    <span className="font-medium text-foreground">Action:</span>{" "}
                    <span className="text-muted-foreground">{p.action}</span>
                  </p>
                </div>
              </div>
              {p.toolPath && (
                <a
                  href={p.toolPath}
                  className="rounded-md bg-white/5 px-2.5 py-1 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
                >
                  Open tool →
                </a>
              )}
            </div>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
