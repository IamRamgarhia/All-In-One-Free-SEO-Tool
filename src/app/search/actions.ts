"use server";

import { requireSignedIn } from "@/lib/action-guard";

import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { currentUser, visibleClientIds } from "@/lib/auth";
import { db } from "@/db/client";
import { getDisabledTools } from "@/lib/tool-activation";
import { isToolDisabled } from "@/lib/tool-catalog";
import { getTranslations } from "next-intl/server";
import { resolveToolCopy } from "@/lib/i18n/tool-copy";
import { searchableTools } from "@/lib/tool-registry";
import {
  audits,
  clients,
  competitors,
  invoices,
  keywords,
  outreachContacts,
  seoResources,
  tasks,
} from "@/db/schema";

export type SearchHit = {
  type:
    | "client"
    | "task"
    | "keyword"
    | "audit"
    | "competitor"
    | "brief"
    | "outreach"
    | "invoice"
    | "resource"
    | "tool";
  id: number;
  href: string;
  title: string;
  subtitle?: string;
};

/**
 * Tools are searched from the registry (lib/tool-registry.ts), named by
 * the same translations as Settings → Tools.
 *
 * This used to be its own hand-kept copy of 83 tools "kept in sync with"
 * the tools page: English titles only, eight retired tools still offered
 * next to the tools that replaced them, and none of the pages the old
 * grid missed (ask the AI, content gap, AI bot logs…).
 */
async function toolIndex(): Promise<
  Array<{ href: string; title: string; subtitle: string; keywords: string }>
> {
  const [settings, catalog, nav] = await Promise.all([
    getTranslations("settings.tools"),
    getTranslations("tools.catalog"),
    getTranslations("nav.items"),
  ]);
  return searchableTools().flatMap((t) => {
    const copy = resolveToolCopy(t.href, { settings, catalog, nav });
    if (!copy) return [];
    return [{ href: t.href, title: copy.title, subtitle: copy.description, keywords: t.keywords }];
  });
}

export type SearchResults = {
  query: string;
  hits: SearchHit[];
};

export async function search(rawQuery: string): Promise<SearchResults> {
  await requireSignedIn();
  const q = rawQuery.trim();
  if (q.length < 1) return { query: q, hits: [] };
  const pattern = `%${q}%`;
  const qLc = q.toLowerCase();

  // Members and client viewers only find rows of the clients assigned to
  // them; rows with no client (agency-wide) are not theirs either.
  const scope = await visibleClientIds(await currentUser());
  const inScope = (col: AnySQLiteColumn) =>
    scope === null ? undefined : inArray(col, scope.length ? scope : [-1]);

  const hits: SearchHit[] = [];

  // Tools — first-class hit type so users can jump to any of the 90+
  // tools from the top search bar. In-memory match against title +
  // subtitle + keyword tags. Limited to 8 to keep the palette tidy.
  // Tools turned off in Settings → Tools are not offered.
  const disabled = await getDisabledTools();
  let toolIdx = 0;
  for (const t of await toolIndex()) {
    if (isToolDisabled(t.href, disabled)) continue;
    const hay = `${t.title} ${t.subtitle} ${t.keywords}`.toLowerCase();
    if (hay.includes(qLc)) {
      hits.push({
        type: "tool",
        id: toolIdx++,
        href: t.href,
        title: t.title,
        subtitle: t.subtitle,
      });
      if (toolIdx >= 8) break;
    }
  }

  // Clients — by name or url
  const clientMatches = await db
    .select({ id: clients.id, name: clients.name, url: clients.url })
    .from(clients)
    .where(and(or(like(clients.name, pattern), like(clients.url, pattern)), inScope(clients.id)))
    .limit(5);
  for (const c of clientMatches) {
    hits.push({
      type: "client",
      id: c.id,
      href: `/clients/${c.id}`,
      title: c.name,
      subtitle: c.url,
    });
  }

  // Tasks — by title
  const taskMatches = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      clientId: tasks.clientId,
      clientName: clients.name,
      priority: tasks.priority,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(and(like(tasks.title, pattern), inScope(tasks.clientId)))
    .orderBy(desc(tasks.createdAt))
    .limit(6);
  for (const t of taskMatches) {
    hits.push({
      type: "task",
      id: t.id,
      href: "/tasks",
      title: t.title,
      subtitle: `${t.priority} · ${t.clientName ?? "—"}`,
    });
  }

  // Keywords — by query
  const keywordMatches = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientName: clients.name,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(and(like(keywords.query, pattern), inScope(keywords.clientId)))
    .orderBy(desc(keywords.createdAt))
    .limit(5);
  for (const k of keywordMatches) {
    hits.push({
      type: "keyword",
      id: k.id,
      href: "/keywords",
      title: k.query,
      subtitle: `${k.country} · ${k.clientName ?? "—"}`,
    });
  }

  // Competitors — by name or url
  const competitorMatches = await db
    .select({
      id: competitors.id,
      name: competitors.name,
      url: competitors.url,
      clientName: clients.name,
    })
    .from(competitors)
    .leftJoin(clients, eq(competitors.clientId, clients.id))
    .where(
      and(
        or(like(competitors.name, pattern), like(competitors.url, pattern)),
        inScope(competitors.clientId),
      ),
    )
    .limit(4);
  for (const c of competitorMatches) {
    hits.push({
      type: "competitor",
      id: c.id,
      href: "/competitors",
      title: c.name,
      subtitle: `competitor · ${c.clientName ?? "—"}`,
    });
  }

  // Outreach contacts
  const outreachMatches = await db
    .select({
      id: outreachContacts.id,
      name: outreachContacts.name,
      email: outreachContacts.email,
      status: outreachContacts.status,
      clientName: clients.name,
    })
    .from(outreachContacts)
    .leftJoin(clients, eq(outreachContacts.clientId, clients.id))
    .where(
      and(
        or(
          like(outreachContacts.name, pattern),
          like(outreachContacts.email, pattern),
          like(outreachContacts.website, pattern),
        ),
        inScope(outreachContacts.clientId),
      ),
    )
    .limit(4);
  for (const o of outreachMatches) {
    hits.push({
      type: "outreach",
      id: o.id,
      href: "/outreach",
      title: o.name,
      subtitle: `${o.status} · ${o.clientName ?? "—"}${o.email ? " · " + o.email : ""}`,
    });
  }

  // Invoices — by number or client
  const invoiceMatches = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      clientName: clients.name,
    })
    .from(invoices)
    .leftJoin(clients, eq(invoices.clientId, clients.id))
    .where(and(like(invoices.invoiceNumber, pattern), inScope(invoices.clientId)))
    .limit(4);
  for (const i of invoiceMatches) {
    hits.push({
      type: "invoice",
      id: i.id,
      href: `/invoices/${i.id}`,
      title: i.invoiceNumber,
      subtitle: `${i.status} · ${i.clientName ?? "—"}`,
    });
  }

  // Link-building resources — domain match (cap to 4)
  const resourceMatches = await db
    .select({
      id: seoResources.id,
      domain: seoResources.domain,
      category: seoResources.category,
      da: seoResources.da,
    })
    .from(seoResources)
    .where(like(seoResources.domain, pattern))
    .orderBy(desc(seoResources.da))
    .limit(4);
  for (const r of resourceMatches) {
    hits.push({
      type: "resource",
      id: r.id,
      href: `/link-building?q=${encodeURIComponent(r.domain)}`,
      title: r.domain,
      subtitle: `${r.category} · DA ${r.da ?? "—"}`,
    });
  }

  // Audits — exact id match (e.g. user types "12")
  if (/^\d+$/.test(q)) {
    const auditId = Number(q);
    const [a] = await db
      .select({
        id: audits.id,
        score: audits.score,
        clientName: clients.name,
      })
      .from(audits)
      .leftJoin(clients, eq(audits.clientId, clients.id))
      .where(and(eq(audits.id, auditId), inScope(audits.clientId)))
      .limit(1);
    if (a) {
      hits.push({
        type: "audit",
        id: a.id,
        href: `/audits/${a.id}`,
        title: `Audit #${a.id}`,
        subtitle: `${a.clientName ?? "—"} · score ${a.score ?? "—"}`,
      });
    }
  }

  return { query: q, hits };
}
