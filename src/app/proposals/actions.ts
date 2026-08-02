"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditIssues,
  audits,
  clients,
  graderLeads,
  proposals,
} from "@/db/schema";
import { canEdit, canSeeClient, currentUser } from "@/lib/auth";
import { deriveScope, unmappedFindingTypes } from "@/lib/proposal-scope";

async function assertCanEdit(): Promise<string | null> {
  const me = await currentUser();
  if (me && !canEdit(me.role)) return "You have read-only access.";
  return null;
}

export type CreateResult =
  | { ok: true; id: number; unmapped: string[] }
  | { ok: false; error: string };

/**
 * Build a proposal from the latest audit for a client, or from a lead
 * captured by the grader widget.
 *
 * Scope comes from findings that were actually observed — see
 * lib/proposal-scope.ts for why nothing here forecasts traffic or
 * revenue. Pricing starts empty because the tool has no basis for
 * pricing someone else's labour.
 */
export async function createProposal(input: {
  clientId?: number;
  leadId?: number;
}): Promise<CreateResult> {
  const result = await buildProposal(input);
  if (result.ok) revalidatePath("/proposals");
  return result;
}

/**
 * The work, without the request-scoped parts.
 *
 * `revalidatePath` throws outside a request, which made this whole path
 * unreachable from a script — the same shape of problem the public
 * grader had with `headers()`. Both times the fix was to separate "read
 * or notify the framework" from "do the thing", which is better design
 * regardless of testing.
 */
export async function buildProposal(input: {
  clientId?: number;
  leadId?: number;
}): Promise<CreateResult> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };

  let prospectName = "";
  let prospectUrl: string | null = null;
  let prospectEmail: string | null = null;
  let findings: { type: string; severity: string }[] = [];
  let auditId: number | null = null;
  let score: number | null = null;
  let basedOnAt: Date | null = null;

  if (input.clientId) {
    if (!(await canSeeClient(await currentUser(), input.clientId))) {
      return { ok: false, error: "No such client." };
    }
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);
    if (!client) return { ok: false, error: "No such client." };

    prospectName = client.name;
    prospectUrl = client.url;
    prospectEmail = client.email;

    const [latest] = await db
      .select()
      .from(audits)
      .where(
        and(eq(audits.clientId, client.id), eq(audits.status, "completed")),
      )
      .orderBy(desc(audits.id))
      .limit(1);

    if (!latest) {
      return {
        ok: false,
        error:
          "Run an audit for this client first — a proposal built from nothing would just be a template.",
      };
    }

    auditId = latest.id;
    score = latest.score;
    basedOnAt = latest.completedAt;
    findings = await db
      .select({ type: auditIssues.type, severity: auditIssues.severity })
      .from(auditIssues)
      .where(
        and(eq(auditIssues.auditId, latest.id), eq(auditIssues.status, "new")),
      );
  } else if (input.leadId) {
    const [lead] = await db
      .select()
      .from(graderLeads)
      .where(eq(graderLeads.id, input.leadId))
      .limit(1);
    if (!lead) return { ok: false, error: "No such lead." };

    try {
      prospectName = lead.name ?? new URL(lead.url).hostname.replace(/^www\./i, "");
    } catch {
      prospectName = lead.name ?? lead.url;
    }
    prospectUrl = lead.url;
    prospectEmail = lead.email;
    score = lead.score;
    basedOnAt = lead.createdAt;
    findings = (lead.findingsJson ?? []).map((f) => ({
      type: f.type,
      severity: f.severity,
    }));
  } else {
    return { ok: false, error: "Pick a client or a lead." };
  }

  const scope = deriveScope(findings);
  const unmapped = unmappedFindingTypes(findings);

  const [row] = await db
    .insert(proposals)
    .values({
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      prospectName,
      prospectUrl,
      prospectEmail,
      title: `SEO proposal — ${prospectName}`,
      intro: null,
      scopeJson: scope,
      pricingJson: [],
      auditId,
      basedOnScore: score,
      basedOnAt,
    })
    .returning({ id: proposals.id });

  return { ok: true, id: row.id, unmapped };
}

export async function updateProposal(
  id: number,
  patch: {
    title?: string;
    intro?: string;
    terms?: string;
    currency?: string;
    scope?: { label: string; detail: string; findings: number }[];
    pricing?: { label: string; detail: string; amount: number }[];
    status?: "draft" | "sent" | "accepted" | "declined";
  },
): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };

  const [existing] = await db
    .select({ clientId: proposals.clientId })
    .from(proposals)
    .where(eq(proposals.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: "No such proposal." };
  if (
    existing.clientId &&
    !(await canSeeClient(await currentUser(), existing.clientId))
  ) {
    return { ok: false, error: "No such proposal." };
  }

  await db
    .update(proposals)
    .set({
      ...patch,
      ...(patch.scope ? { scopeJson: patch.scope } : {}),
      ...(patch.pricing ? { pricingJson: patch.pricing } : {}),
      ...(patch.status === "sent" ? { sentAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, id));

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposal(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  const denied = await assertCanEdit();
  if (denied) return { ok: false, error: denied };
  await db.delete(proposals).where(eq(proposals.id, id));
  revalidatePath("/proposals");
  return { ok: true };
}
