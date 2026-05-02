"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, tasks, type ClientSocialLinks } from "@/db/schema";
import {
  listGscProperties,
  listGa4Properties,
  type GscProperty,
  type Ga4Property,
} from "@/lib/google-oauth";
import { fetchSiteMetadata } from "@/lib/site-metadata";
import { detectTechStack } from "@/lib/tech-detect";
import { getNicheTemplates } from "@/lib/niche-templates";
import {
  pickStackTemplates,
  type StackTaskTemplate,
} from "@/lib/tech-stack-templates";
import { logActivity } from "@/lib/activity";

export type ImportablePair = {
  /** Stable key combining gsc + ga4 (used as checkbox value) */
  key: string;
  /** GSC property identifier — "sc-domain:..." or "https://..." */
  gscProperty: string | null;
  /** GA4 numeric ID, e.g. "123456789" */
  ga4PropertyId: string | null;
  /** Domain-style display label, e.g. "acmecoffee.com" */
  domain: string;
  /** Best-guess client name from GA4 displayName, falls back to domain */
  name: string;
  /** Best-guess URL we'll feed into auto-fetch later */
  url: string;
  /** True if already imported as a client */
  alreadyImported: boolean;
};

export type ListImportableResult =
  | { ok: true; pairs: ImportablePair[]; gscCount: number; ga4Count: number }
  | { ok: false; error: string };

/**
 * Fetches GSC + GA4 properties from the connected Google account, pairs them
 * by domain heuristic, and surfaces a list ready for one-click import.
 */
export async function listImportableProperties(): Promise<ListImportableResult> {
  let gsc: GscProperty[] = [];
  let ga4: Ga4Property[] = [];
  try {
    [gsc, ga4] = await Promise.all([
      listGscProperties().catch(() => []),
      listGa4Properties().catch(() => []),
    ]);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  // Existing clients keyed by GSC property + GA4 property to detect already-imported.
  const existing = await db.select().from(clients);
  const existingGsc = new Set(
    existing.map((c) => c.gscProperty).filter(Boolean) as string[],
  );
  const existingGa4 = new Set(
    existing.map((c) => c.ga4PropertyId).filter(Boolean) as string[],
  );

  // Pair by domain
  const ga4ByDomain = new Map<string, Ga4Property>();
  for (const p of ga4) {
    const d = guessDomainFromGa4(p);
    if (d && !ga4ByDomain.has(d)) ga4ByDomain.set(d, p);
  }

  const pairs: ImportablePair[] = [];
  const claimedGa4 = new Set<string>();

  for (const g of gsc) {
    const domain = domainFromGscSite(g.siteUrl);
    if (!domain) continue;
    const matchedGa4 = ga4ByDomain.get(domain);
    if (matchedGa4) claimedGa4.add(matchedGa4.id);

    pairs.push({
      key: `gsc:${g.siteUrl}`,
      gscProperty: g.siteUrl,
      ga4PropertyId: matchedGa4?.id ?? null,
      domain,
      name: matchedGa4?.displayName ?? domain,
      url: urlFromDomain(domain),
      alreadyImported:
        existingGsc.has(g.siteUrl) ||
        (matchedGa4 ? existingGa4.has(matchedGa4.id) : false),
    });
  }

  // Surface GA4-only properties (no matching GSC) so user can still import
  for (const p of ga4) {
    if (claimedGa4.has(p.id)) continue;
    const domain = guessDomainFromGa4(p) ?? p.displayName;
    pairs.push({
      key: `ga4:${p.id}`,
      gscProperty: null,
      ga4PropertyId: p.id,
      domain,
      name: p.displayName,
      url: urlFromDomain(domain),
      alreadyImported: existingGa4.has(p.id),
    });
  }

  return { ok: true, pairs, gscCount: gsc.length, ga4Count: ga4.length };
}

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

type Niche = "local" | "ecommerce" | "saas" | "blog" | "services";

/**
 * Bulk-creates clients from selected GSC/GA4 pairs. For each pair we run the
 * full single-add pipeline: site metadata fetch (logo, social, address),
 * tech-stack detection, niche templates, stack templates.
 */
export async function importSelectedProperties(opts: {
  keys: string[];
}): Promise<ImportResult> {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  if (opts.keys.length === 0) {
    return { imported: 0, skipped: 0, errors: ["Nothing selected."] };
  }

  // Reload the importable list so we have full pair info from the keys
  const list = await listImportableProperties();
  if (!list.ok) {
    return { imported: 0, skipped: 0, errors: [list.error] };
  }
  const byKey = new Map(list.pairs.map((p) => [p.key, p]));

  for (const key of opts.keys) {
    const pair = byKey.get(key);
    if (!pair) {
      errors.push(`Unknown property: ${key}`);
      continue;
    }
    if (pair.alreadyImported) {
      skipped += 1;
      continue;
    }

    try {
      await createSingleClientFromPair(pair);
      imported += 1;
    } catch (err) {
      errors.push(`${pair.domain}: ${(err as Error).message}`);
    }
  }

  revalidatePath("/clients");
  revalidatePath("/");
  return { imported, skipped, errors };
}

async function createSingleClientFromPair(pair: ImportablePair): Promise<void> {
  const meta = await fetchSiteMetadata(pair.url).catch(() => null);

  const techDetection = await detectTechStack(pair.url).catch(() => null);
  const techStack = techDetection?.technologies.map((t) => t.name) ?? null;

  const social: ClientSocialLinks = meta?.socialLinks ?? {};

  const niche = inferNicheFromTechStack(techStack);

  const [row] = await db
    .insert(clients)
    .values({
      name: meta?.name ?? pair.name,
      url: meta?.url ?? pair.url,
      niche,
      techStack,
      logoUrl: meta?.logoUrl ?? null,
      description: meta?.description ?? null,
      address: meta?.address ?? null,
      phone: meta?.phone ?? null,
      email: meta?.email ?? null,
      gbpUrl: meta?.gbpUrl ?? null,
      socialLinks: Object.keys(social).length > 0 ? social : null,
      gscProperty: pair.gscProperty,
      ga4PropertyId: pair.ga4PropertyId,
    })
    .returning({ id: clients.id });

  await applyNicheTemplatesInternal(row.id, niche);
  await applyStackTemplatesInternal(row.id, techStack);

  await logActivity({
    kind: "client.created",
    message: `Imported ${pair.domain} from Google${
      pair.gscProperty && pair.ga4PropertyId
        ? " (GSC + GA4 linked)"
        : pair.gscProperty
          ? " (GSC linked)"
          : " (GA4 linked)"
    }.`,
    level: "success",
    clientId: row.id,
    entityType: "client",
    entityId: row.id,
  });
}

async function applyStackTemplatesInternal(
  clientId: number,
  techStack: string[] | null,
): Promise<void> {
  const { tasks: stackTasks } = pickStackTemplates(techStack);
  if (stackTasks.length === 0) return;

  const existing = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        inArray(
          tasks.title,
          stackTasks.map((t) => t.title),
        ),
      ),
    );
  const existingTitles = new Set(existing.map((e) => e.title));
  const toInsert = stackTasks.filter((t) => !existingTitles.has(t.title));
  if (toInsert.length > 0) {
    await db.insert(tasks).values(
      toInsert.map((t: StackTaskTemplate) => ({
        clientId,
        title: t.title,
        description: t.description,
        whyItMatters: t.whyItMatters,
        priority: t.priority,
        status: "todo" as const,
      })),
    );
  }
}

async function applyNicheTemplatesInternal(
  clientId: number,
  niche: Niche | null,
): Promise<void> {
  const templates = getNicheTemplates(niche);
  if (templates.length === 0) return;

  const existing = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        inArray(
          tasks.title,
          templates.map((t) => t.title),
        ),
      ),
    );
  const existingTitles = new Set(existing.map((e) => e.title));
  const toInsert = templates.filter((t) => !existingTitles.has(t.title));
  if (toInsert.length > 0) {
    await db.insert(tasks).values(
      toInsert.map((t) => ({
        clientId,
        title: t.title,
        description: t.description,
        whyItMatters: t.whyItMatters,
        priority: t.priority,
        status: "todo" as const,
      })),
    );
  }
}

/**
 * Niche detection from tech stack — quick heuristic (e.g. WooCommerce ⇒
 * ecommerce). Imperfect but better than null. User can change later.
 */
function inferNicheFromTechStack(stack: string[] | null): Niche | null {
  if (!stack || stack.length === 0) return null;
  const set = new Set(stack.map((s) => s.toLowerCase()));
  if (
    set.has("shopify") ||
    set.has("woocommerce") ||
    set.has("magento") ||
    set.has("bigcommerce")
  ) {
    return "ecommerce";
  }
  if (set.has("ghost") || set.has("hugo") || set.has("jekyll")) return "blog";
  return null;
}

function domainFromGscSite(siteUrl: string): string | null {
  // sc-domain:example.com or https://example.com/
  if (siteUrl.startsWith("sc-domain:")) {
    return siteUrl.slice("sc-domain:".length).toLowerCase();
  }
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function guessDomainFromGa4(p: Ga4Property): string | null {
  // GA4 doesn't expose the URL on accountSummaries — best we can do is
  // pattern-match the displayName for a domain-shaped string.
  const m = p.displayName.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
  if (m) return m[1].toLowerCase();
  return null;
}

function urlFromDomain(domain: string): string {
  if (/^https?:\/\//i.test(domain)) return domain;
  return `https://${domain}`;
}
