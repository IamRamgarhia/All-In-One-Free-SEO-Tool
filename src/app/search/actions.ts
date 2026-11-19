"use server";

import { like, or, eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
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
import { guardAction } from "@/lib/action-guard";
import { searchableTools } from "@/lib/tool-registry";

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
 * The tool index, derived from the registry rather than kept in step
 * with it by hand.
 *
 * This was 83 entries copied out of the grid, and the comment above it
 * said "Keep in sync with /src/app/tools/page.tsx" — which is the
 * instruction that does not work. Measured on 19 Nov 2026 it had
 * drifted: EIGHT of the 83 were retired tools, so searching for
 * "schema" offered /tools/schema-validate, and searching for "preview"
 * offered /tools/pixel-preview, while the tools that replaced them sat
 * in the same list. Search was actively steering people to superseded
 * pages.
 *
 * It also meant the ten tools that were in no surface at all could not
 * be found here either — including /ask, which is the one a confused
 * user would most plausibly search for.
 *
 * searchableTools() drops retired entries and external cards, so both
 * failures are now structurally impossible rather than a thing to
 * remember. The per-tool search synonyms that used to live here moved
 * into the registry's `keywords` field.
 */
const TOOL_INDEX: Array<{
  href: string;
  title: string;
  subtitle: string;
  keywords: string;
}> = searchableTools().map((t) => ({
  href: t.href,
  title: t.title,
  subtitle: t.description,
  keywords: t.keywords ?? "",
}));

export type SearchResults = {
  query: string;
  hits: SearchHit[];
};

export async function search(rawQuery: string): Promise<SearchResults> {
  await guardAction("edit");
  const q = rawQuery.trim();
  if (q.length < 1) return { query: q, hits: [] };
  const pattern = `%${q}%`;
  const qLc = q.toLowerCase();

  const hits: SearchHit[] = [];

  // Tools — first-class hit type so users can jump to any of the 90+
  // tools from the top search bar. In-memory match against title +
  // subtitle + keyword tags. Limited to 8 to keep the palette tidy.
  let toolIdx = 0;
  for (const t of TOOL_INDEX) {
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
    .where(or(like(clients.name, pattern), like(clients.url, pattern)))
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
    .where(like(tasks.title, pattern))
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
    .where(like(keywords.query, pattern))
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
    .where(or(like(competitors.name, pattern), like(competitors.url, pattern)))
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
      or(
        like(outreachContacts.name, pattern),
        like(outreachContacts.email, pattern),
        like(outreachContacts.website, pattern),
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
    .where(like(invoices.invoiceNumber, pattern))
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
      .where(eq(audits.id, auditId))
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
