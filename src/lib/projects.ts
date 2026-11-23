import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { pickReferenceAudits } from "./reference-audit";
import { db } from "@/db/client";
import {
  auditIssues,
  audits,
  clientAccounts,
  clients,
  missions,
  type ClientAccount,
  type Mission,
  type MissionKind,
} from "@/db/schema";
import { canCreateMission, type AuditFacts } from "./missions";

/**
 * Client -> Project -> Mission, the reads and writes.
 *
 * A row of `clients` is one site: that is the project. `client_accounts`
 * is the company it belongs to. See migration 0080.
 */

/**
 * Give an account to every project that has none.
 *
 * Projects are created in six places (add client, imports, leads…), none
 * of which knows about accounts. Rather than teach each of them, a project
 * inserted without one gets its own account the next time accounts are
 * read. Idempotent, and a no-op once everything is paired.
 */
export async function ensureAccounts(): Promise<void> {
  const orphans = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      phone: clients.phone,
      address: clients.address,
    })
    .from(clients)
    .where(isNull(clients.accountId));
  for (const c of orphans) {
    const [account] = await db
      .insert(clientAccounts)
      .values({ name: c.name, email: c.email, phone: c.phone, address: c.address })
      .returning({ id: clientAccounts.id });
    await db.update(clients).set({ accountId: account.id }).where(eq(clients.id, c.id));
  }
}

export type ProjectSummary = {
  id: number;
  name: string;
  url: string;
  logoUrl: string | null;
  missions: Mission[];
};

export type AccountWithProjects = ClientAccount & { projects: ProjectSummary[] };

/**
 * Accounts with their projects and missions, limited to the projects the
 * signed-in user may see. An account with no visible project is left out.
 */
export async function listAccountsWithProjects(): Promise<AccountWithProjects[]> {
  await ensureAccounts();
  // Imported here: client-scope reads the request (cookies), and the rest
  // of this file must stay usable from scripts and background jobs.
  const { scopedClientIds } = await import("./client-scope");
  const scope = await scopedClientIds();
  if (scope !== null && scope.length === 0) return [];

  const projectRows = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      logoUrl: clients.logoUrl,
      accountId: clients.accountId,
    })
    .from(clients)
    .where(scope === null ? sql`1=1` : inArray(clients.id, scope))
    .orderBy(asc(clients.name));
  if (projectRows.length === 0) return [];

  const ids = projectRows.map((p) => p.id);
  const missionRows = await db
    .select()
    .from(missions)
    .where(inArray(missions.clientId, ids))
    .orderBy(desc(missions.createdAt));
  const accountIds = [...new Set(projectRows.map((p) => p.accountId).filter((x): x is number => x !== null))];
  const accountRows = accountIds.length
    ? await db
        .select()
        .from(clientAccounts)
        .where(inArray(clientAccounts.id, accountIds))
        .orderBy(asc(clientAccounts.name))
    : [];

  return accountRows.map((a) => ({
    ...a,
    projects: projectRows
      .filter((p) => p.accountId === a.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        logoUrl: p.logoUrl,
        missions: missionRows.filter((m) => m.clientId === p.id),
      })),
  }));
}

/** The account, if the signed-in user may see at least one of its projects. */
export async function visibleAccount(accountId: number): Promise<AccountWithProjects | null> {
  if (!Number.isInteger(accountId)) return null;
  return (await listAccountsWithProjects()).find((a) => a.id === accountId) ?? null;
}

export async function listMissions(projectId: number): Promise<Mission[]> {
  return db
    .select()
    .from(missions)
    .where(eq(missions.clientId, projectId))
    .orderBy(desc(missions.createdAt));
}

/** What the mission rules (lib/missions.ts) need to know about a project. */
export async function auditFacts(projectId: number): Promise<AuditFacts> {
  const done = await db
    .select({
      id: audits.id,
      kind: audits.kind,
      mode: audits.mode,
      score: audits.score,
      pagesCrawled: audits.pagesCrawled,
    })
    .from(audits)
    .where(
      and(eq(audits.clientId, projectId), eq(audits.status, "completed"), eq(audits.kind, "crawler")),
    )
    .orderBy(desc(audits.completedAt));

  // Rows written before the mode column existed have no mode: they were
  // full crawls. The reference audit is the same everywhere (lib/reference-audit.ts).
  const full = done.find((a) => a.mode !== "quick") ?? null;
  const { latest } = pickReferenceAudits(done);
  let critical = 0;
  let high = 0;
  if (latest) {
    const rows = await db
      .select({ severity: auditIssues.severity, n: sql<number>`count(*)` })
      .from(auditIssues)
      .where(eq(auditIssues.auditId, latest.id))
      .groupBy(auditIssues.severity);
    critical = rows.find((r) => r.severity === "critical")?.n ?? 0;
    high = rows.find((r) => r.severity === "high")?.n ?? 0;
  }
  return {
    fullAuditDone: full !== null,
    quickAuditDone: done.some((a) => a.mode === "quick"),
    score: latest?.score ?? null,
    critical,
    high,
    pagesCrawled: latest?.pagesCrawled ?? null,
  };
}

export class MissionNeedsAuditError extends Error {
  constructor() {
    super("A mission needs a completed audit of the project first.");
    this.name = "MissionNeedsAuditError";
  }
}

/**
 * Create a mission on a project. Refused until the project has been
 * audited (the quick audit run when it was added is enough): the audit is
 * what the strategy, the follow-up or the redesign specification is built on.
 */
export async function createMission(input: {
  projectId: number;
  kind: MissionKind;
  title: string;
  offerIds?: number[];
  targetStack?: string | null;
  notes?: string | null;
  proposalId?: number | null;
}): Promise<Mission> {
  if (!canCreateMission(await auditFacts(input.projectId))) throw new MissionNeedsAuditError();
  const [row] = await db
    .insert(missions)
    .values({
      clientId: input.projectId,
      kind: input.kind,
      title: input.title,
      offersJson: input.offerIds ?? null,
      targetStack: input.targetStack ?? null,
      notes: input.notes ?? null,
      proposalId: input.proposalId ?? null,
    })
    .returning();
  return row;
}
