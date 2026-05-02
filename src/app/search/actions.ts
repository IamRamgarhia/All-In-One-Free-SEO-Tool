"use server";

import { like, or, eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  clients,
  contentBriefs,
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
    | "resource";
  id: number;
  href: string;
  title: string;
  subtitle?: string;
};

export type SearchResults = {
  query: string;
  hits: SearchHit[];
};

export async function search(rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim();
  if (q.length < 1) return { query: q, hits: [] };
  const pattern = `%${q}%`;

  const hits: SearchHit[] = [];

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

  // Content briefs — by keyword or title
  const briefMatches = await db
    .select({
      id: contentBriefs.id,
      title: contentBriefs.title,
      targetKeyword: contentBriefs.targetKeyword,
      status: contentBriefs.status,
      clientName: clients.name,
    })
    .from(contentBriefs)
    .leftJoin(clients, eq(contentBriefs.clientId, clients.id))
    .where(
      or(
        like(contentBriefs.title, pattern),
        like(contentBriefs.targetKeyword, pattern),
      ),
    )
    .limit(4);
  for (const b of briefMatches) {
    hits.push({
      type: "brief",
      id: b.id,
      href: "/content",
      title: b.title,
      subtitle: `${b.status} · ${b.targetKeyword}`,
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
