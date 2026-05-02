"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  clients,
  monitoredPages,
  pageChanges,
} from "@/db/schema";

export type Notification = {
  id: string; // composite to support multiple sources
  kind: "audit_complete" | "audit_failed" | "page_change" | "score_drop";
  level: "success" | "warning" | "error" | "info";
  title: string;
  body: string;
  href: string;
  at: Date;
};

export async function recentNotifications(): Promise<Notification[]> {
  const out: Notification[] = [];

  // Audits — last 8 across clients
  const recentAudits = await db
    .select({
      id: audits.id,
      score: audits.score,
      issuesCount: audits.issuesCount,
      status: audits.status,
      completedAt: audits.completedAt,
      createdAt: audits.createdAt,
      clientId: audits.clientId,
      clientName: clients.name,
    })
    .from(audits)
    .leftJoin(clients, eq(audits.clientId, clients.id))
    .orderBy(desc(audits.createdAt))
    .limit(8);

  // Compute per-client "previous completed" to detect drops
  const prevByClient = new Map<number, number>(); // clientId -> previous score
  for (const a of [...recentAudits].reverse()) {
    if (a.status !== "completed" || a.score === null) continue;
    const prev = prevByClient.get(a.clientId);
    if (prev !== undefined && a.score - prev <= -5) {
      out.push({
        id: `score:${a.id}`,
        kind: "score_drop",
        level: "warning",
        title: `Score dropped — ${a.clientName ?? "Client"}`,
        body: `Health score went from ${prev} → ${a.score} (-${prev - a.score}).`,
        href: `/audits/${a.id}`,
        at: a.completedAt ?? a.createdAt,
      });
    }
    prevByClient.set(a.clientId, a.score);
  }

  for (const a of recentAudits) {
    if (a.status === "failed") {
      out.push({
        id: `audit:${a.id}`,
        kind: "audit_failed",
        level: "error",
        title: `Audit failed — ${a.clientName ?? "Client"}`,
        body: "Site may be unreachable. Try running again.",
        href: `/audits/${a.id}`,
        at: a.completedAt ?? a.createdAt,
      });
    } else if (a.status === "completed") {
      out.push({
        id: `audit:${a.id}`,
        kind: "audit_complete",
        level: "success",
        title: `Audit complete — ${a.clientName ?? "Client"}`,
        body: `Score ${a.score ?? "—"} · ${a.issuesCount} issues found.`,
        href: `/audits/${a.id}`,
        at: a.completedAt ?? a.createdAt,
      });
    }
  }

  // Page changes — last 10 (skip pure content-hash diffs to reduce noise)
  const changes = await db
    .select({
      id: pageChanges.id,
      field: pageChanges.field,
      oldValue: pageChanges.oldValue,
      newValue: pageChanges.newValue,
      detectedAt: pageChanges.detectedAt,
      pageUrl: monitoredPages.url,
      pageLabel: monitoredPages.label,
      clientId: monitoredPages.clientId,
      clientName: clients.name,
    })
    .from(pageChanges)
    .leftJoin(
      monitoredPages,
      eq(pageChanges.monitoredPageId, monitoredPages.id),
    )
    .leftJoin(clients, eq(monitoredPages.clientId, clients.id))
    .orderBy(desc(pageChanges.detectedAt))
    .limit(10);

  for (const c of changes) {
    if (c.field === "content") continue;
    out.push({
      id: `change:${c.id}`,
      kind: "page_change",
      level: "warning",
      title: `${c.field} changed — ${c.clientName ?? "Client"}`,
      body: `${c.pageLabel ?? c.pageUrl?.replace(/^https?:\/\//, "") ?? ""} · "${(c.oldValue ?? "—").slice(0, 60)}" → "${(c.newValue ?? "—").slice(0, 60)}"`,
      href: "/monitor",
      at: c.detectedAt,
    });
  }

  // Sort newest first, cap to 15
  out.sort((a, b) => b.at.getTime() - a.at.getTime());
  return out.slice(0, 15);
}
