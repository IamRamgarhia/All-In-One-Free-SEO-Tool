"use server";

import type { Tx } from "@/lib/tx";
import { bestPageFor } from "@/lib/keyword-relevance";
import { pickReferenceAudits } from "@/lib/reference-audit";
import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { splitSurfaces, surfacesFor } from "@/lib/engagement-surfaces";
import { classifyIntent } from "@/lib/keyword-research";
import { and, count, desc, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { actionTx } from "@/lib/action-tx";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditIssues,
  audits,
  clients,
  graderLeads,
  invoices,
  keywordRankings,
  keywords,
  proposals,
  tasks,
} from "@/db/schema";
import { accountsEnabled, canEdit, canSeeClient, currentUser } from "@/lib/auth";
import { SEVERITIES, deriveScope, unmappedFindingTypes } from "@/lib/proposal-scope";
import { DEFAULT_HOURLY_RATE, DEFAULT_QUOTE, type QuoteSettings } from "@/lib/quote";
import { getSetting } from "@/lib/settings-store";

async function assertCanEdit(tx: Tx): Promise<string | null> {
  const me = await currentUser();
  // A signed-out caller on a workspace with accounts is not the local
  // single user: it must not be allowed to write.
  if (!me && accountsEnabled()) return tx("youHaveReadOnlyAccess");
  if (me && !canEdit(me.role)) return tx("youHaveReadOnlyAccess");
  return null;
}

/** The locale documents are written in. Falls back to French, the default. */
async function docLocale(): Promise<string> {
  try {
    return await getLocale();
  } catch {
    return "fr";
  }
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
  await requireSignedIn();
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
  await requireSignedIn();
  const tx = await actionTx("ui.app_proposals_actions");
  const denied = await assertCanEdit(tx);
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
      return { ok: false, error: tx("noSuchClient") };
    }
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, input.clientId))
      .limit(1);
    if (!client) return { ok: false, error: tx("noSuchClient") };

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
          tx("runAnAuditForThis"),
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
    if (!lead) return { ok: false, error: tx("noSuchLead") };

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
    return { ok: false, error: tx("pickAClientOrA") };
  }

  const locale = await docLocale();
  const scope = deriveScope(findings, {
    locale,
    minutes: await getSetting<Record<string, number>>("quote.minutes"),
  });
  const unmapped = unmappedFindingTypes(findings);
  const quote: QuoteSettings = {
    ...DEFAULT_QUOTE,
    hourlyRate: (await getSetting<number>("quote.hourly_rate")) ?? DEFAULT_HOURLY_RATE,
  };

  const [row] = await db
    .insert(proposals)
    .values({
      clientId: input.clientId ?? null,
      leadId: input.leadId ?? null,
      prospectName,
      prospectUrl,
      prospectEmail,
      title: locale === "fr" ? `Proposition SEO — ${prospectName}` : `SEO proposal — ${prospectName}`,
      intro: null,
      scopeJson: scope,
      pricingJson: [],
      offersJson: [],
      quoteJson: quote,
      // The catalogue and the hourly rate are in euros whatever the UI language.
      currency: "EUR",
      auditId,
      basedOnScore: score,
      basedOnAt,
    })
    .returning({ id: proposals.id });

  return { ok: true, id: row.id, unmapped };
}

const severitySchema = z.enum(["critical", "high", "medium", "low"]);

const patchSchema = z.object({
  title: z.string().trim().max(200).optional(),
  intro: z.string().max(5000).optional(),
  terms: z.string().max(5000).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  scope: z
    .array(
      z.object({
        label: z.string().max(200),
        detail: z.string().max(1000),
        findings: z.number().int().min(0),
        key: z.string().max(40).optional(),
        minutesEach: z.number().int().min(0).max(4800).optional(),
        bySeverity: z.partialRecord(severitySchema, z.number().int().min(0)).optional(),
      }),
    )
    .max(50)
    .optional(),
  pricing: z
    .array(
      z.object({
        label: z.string().max(200),
        detail: z.string().max(500),
        amount: z.number().min(0).max(10_000_000),
        recurring: z.boolean().optional(),
        offerId: z.number().int().optional(),
      }),
    )
    .max(50)
    .optional(),
  offers: z
    .array(
      z.object({
        offerId: z.number().int(),
        name: z.string().max(200),
        kind: z.enum(["one_off", "monthly"]),
        billing: z.enum(["flat", "hourly"]),
        summary: z.string().max(1000),
        deliverables: z.array(z.string().max(300)).max(30),
        estimatedHours: z.number().int().min(0).max(10_000),
        duration: z.number().int().min(0).max(1000),
        price: z.number().min(0).max(10_000_000),
      }),
    )
    .max(20)
    .optional(),
  quote: z
    .object({
      hourlyRate: z.number().min(0).max(10_000),
      severities: z.array(severitySchema).max(SEVERITIES.length),
      alternatives: z.boolean().optional(),
    })
    .optional(),
  status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
});

export type ProposalPatch = z.input<typeof patchSchema>;

export async function updateProposal(
  id: number,
  rawPatch: ProposalPatch,
): Promise<{ ok: boolean; error?: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_proposals_actions");
  const denied = await assertCanEdit(tx);
  if (denied) return { ok: false, error: denied };
  const parsed = patchSchema.safeParse(rawPatch);
  if (!parsed.success) return { ok: false, error: tx("invalidInput") };
  const { offers, quote, ...patch } = parsed.data;

  const [existing] = await db
    .select({ clientId: proposals.clientId })
    .from(proposals)
    .where(eq(proposals.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: tx("noSuchProposal") };
  if (
    existing.clientId &&
    !(await canSeeClient(await currentUser(), existing.clientId))
  ) {
    return { ok: false, error: tx("noSuchProposal") };
  }

  await db
    .update(proposals)
    .set({
      ...patch,
      ...(patch.scope ? { scopeJson: patch.scope } : {}),
      ...(patch.pricing ? { pricingJson: patch.pricing } : {}),
      ...(offers ? { offersJson: offers } : {}),
      ...(quote ? { quoteJson: quote } : {}),
      ...(patch.status === "sent" ? { sentAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, id));

  // Sending the plan is the moment it stops being a document.
  //
  // Its weeks become tasks with real due dates, so everything that
  // already works on tasks — the board, the overdue count, the ranked
  // list, "work completed this period" in the report — starts working on
  // the plan too. Idempotent, so re-sending never doubles the list.
  if (patch.status === "sent" || patch.status === "accepted") {
    try {
      const { materialisePlan } = await import("@/lib/plan-tasks");
      await materialisePlan(id);
    } catch {
      // A plan that fails to expand must not block the send. The
      // document is still correct and this can be retried.
    }
  }

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposal(
  id: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_proposals_actions");
  const denied = await assertCanEdit(tx);
  if (denied) return { ok: false, error: denied };
  const [existing] = await db
    .select({ clientId: proposals.clientId })
    .from(proposals)
    .where(eq(proposals.id, id))
    .limit(1);
  if (!existing) return { ok: false, error: tx("noSuchProposal") };
  if (existing.clientId && !(await canSeeClient(await currentUser(), existing.clientId))) {
    return { ok: false, error: tx("noSuchProposal") };
  }
  await db.delete(proposals).where(eq(proposals.id, id));
  revalidatePath("/proposals");
  return { ok: true };
}

// =============== Invoice from an accepted proposal ===============

export type InvoiceFromProposalResult =
  | { ok: true; invoiceId: number }
  | { ok: false; error: "readOnly" | "notFound" | "notAccepted" | "noClient" | "noPricing" | "alternatives" };

/**
 * Bill an accepted proposal: one invoice line per price line.
 *
 * One-off lines are billed in full. Monthly lines are billed for the
 * first month, which is what is due at signature; the following months
 * are invoiced as they come. If an invoice was already made from this
 * proposal it is returned rather than duplicated.
 */
export async function createInvoiceFromProposal(
  proposalId: number,
): Promise<InvoiceFromProposalResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_proposals_actions");
  if (await assertCanEdit(tx)) return { ok: false, error: "readOnly" };
  if (!Number.isInteger(proposalId)) return { ok: false, error: "notFound" };

  const [p] = await db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  if (!p) return { ok: false, error: "notFound" };
  if (p.clientId && !(await canSeeClient(await currentUser(), p.clientId))) {
    return { ok: false, error: "notFound" };
  }
  if (p.status !== "accepted") return { ok: false, error: "notAccepted" };
  // Invoices belong to a client. A proposal made from a lead has none
  // until the lead is added as a client.
  if (!p.clientId) return { ok: false, error: "noClient" };

  const [already] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.proposalId, p.id))
    .limit(1);
  if (already) return { ok: true, invoiceId: already.id };

  // Options to choose from: the client took only one of them, and adding
  // up every line would bill services nobody ordered.
  if (p.quoteJson?.alternatives && (p.offersJson?.length ?? 0) > 1) {
    return { ok: false, error: "alternatives" };
  }

  const fr = (await docLocale()) === "fr";
  const items = (p.pricingJson ?? [])
    .filter((l) => l.label.trim() && Number(l.amount) > 0)
    .map((l) => ({
      description: (l.recurring ? `${l.label} — ${fr ? "mois 1" : "month 1"}` : l.label).slice(0, 200),
      quantity: 1,
      rate: Number(l.amount),
    }));
  if (items.length === 0) return { ok: false, error: "noPricing" };

  const [{ value }] = await db.select({ value: count() }).from(invoices);
  const year = new Date().getFullYear();
  const [row] = await db
    .insert(invoices)
    .values({
      clientId: p.clientId,
      proposalId: p.id,
      invoiceNumber: `${fr ? "FAC" : "INV"}-${year}-${String(value + 1).padStart(4, "0")}`,
      status: "draft",
      items,
      currency: p.currency,
      notes: p.title,
    })
    // Two clicks racing: the unique index lets only one invoice through.
    .onConflictDoNothing({ target: invoices.proposalId })
    .returning({ id: invoices.id });
  if (!row) {
    const [existing] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.proposalId, p.id))
      .limit(1);
    return existing ? { ok: true, invoiceId: existing.id } : { ok: false, error: "notFound" };
  }

  revalidatePath("/invoices");
  revalidatePath("/proposals");
  return { ok: true, invoiceId: row.id };
}

// =============== Client kickoff / approval document ===============

/**
 * The document a client is sent before work starts.
 *
 * It is a proposal row, deliberately — proposals already cite the audit
 * they were built from, derive scope from findings that were actually
 * observed, render to a branded PDF, and carry a
 * draft -> sent -> accepted status. That status *is* the approval
 * workflow; adding a second one would have meant two half-built ones.
 *
 * What this adds on top is the two things a client signing off needs and
 * a sales proposal doesn't: where their keywords stand today, and what
 * happens in which week. Both are frozen onto the row rather than
 * recomputed at render time, because they are the baseline the next
 * report gets measured against.
 */
export async function buildKickoffReport(
  clientId: number,
): Promise<CreateResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_proposals_actions");
  const base = await buildProposal({ clientId });
  if (!base.ok) return base;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: tx("noSuchClient") };

  const baseline = await keywordBaselineFor(clientId);
  const timeline = await timelineFor(clientId);
  // Frozen with everything else. What the client agreed to has to still
  // read the same in month three, after somebody has edited the scope on
  // the client record.
  const surfaces = surfacesFor(client.surfacesJson, client.niche);
  const { inScope, outOfScope } = splitSurfaces(surfaces);

  // AI writes the framing only. Every number above is computed, and the
  // prompt is given the numbers rather than the data, so there is nothing
  // for it to get arithmetically wrong. If no model is connected the
  // fallback below is used and the document is still complete.
  // How long the plan RUNS, not how many entries it has.
  //
  // This was timeline.length, which counts only the weeks that happen to
  // contain work. A real generated plan with tasks in weeks 1, 4, 6, 9,
  // 11 and 12 produced "the plan below covers the next 6 weeks" on a
  // document a client signs — off by half, in our favour, in writing.
  const planWeeks = timeline.reduce((max, t) => {
    const n = Number(t.week.replace(/\D+/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  const locale = await docLocale();
  const fr = locale.startsWith("fr");
  let intro = fallbackIntro(client.name, baseline, planWeeks, fr);
  try {
    const { callAI } = await import("@/lib/ai-call");
    const written = await callAI({
      system:
        "You write the opening paragraph of an SEO plan for a client to approve. " +
        "Plain language, no jargon, no hype, no invented numbers. " +
        "Two or three sentences. Never promise rankings or traffic." +
        (fr ? " Write in French, addressing the client as « vous »." : ""),
      user:
        `Client: ${client.name} (${client.url}).\n` +
        `Their site was audited and we found things to fix.\n` +
        (baseline.checked > 0
          ? `They track ${baseline.tracked} keywords, ${baseline.ranking} of which already rank, ` +
            `${baseline.inTopTen} on page one.\n`
          : `They track ${baseline.tracked} keywords; their positions have not been checked yet.\n`) +
        `The plan runs ${planWeeks} weeks.\n` +
        `We will work on: ${inScope.map((sf) => sf.label.toLowerCase()).join(", ") || "nothing agreed yet"}.\n` +
        (outOfScope.length > 0
          ? `Not included: ${outOfScope.map((sf) => sf.label.toLowerCase()).join(", ")}.\n`
          : "") +
        `Write the opening paragraph. Say what we looked at, what we found in general terms, ` +
        `and what the first weeks focus on. Do not repeat the numbers back as a list.`,
    });
    if (written && written.trim().length > 0) intro = written.trim();
  } catch {
    // Keep the fallback — a missing AI key must not block the document.
  }

  await db
    .update(proposals)
    .set({
      title: fr ? `Plan SEO — ${client.name}` : `SEO plan — ${client.name}`,
      intro,
      baselineJson: baseline,
      timelineJson: timeline,
      surfacesJson: surfaces,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, base.id));

  revalidatePath("/proposals");
  revalidatePath(`/clients/${clientId}`);
  return base;
}

/** Computed from tracked keywords and their most recent checked rank. */
async function keywordBaselineFor(clientId: number) {
  const rows = await db
    .select({
      keyword: keywords.query,
      position: keywordRankings.position,
      url: keywordRankings.url,
      checkedAt: keywordRankings.checkedAt,
    })
    .from(keywords)
    .leftJoin(keywordRankings, eq(keywordRankings.keywordId, keywords.id))
    .where(eq(keywords.clientId, clientId))
    .orderBy(desc(keywordRankings.checkedAt));

  // One row per keyword — the newest check wins, and a keyword that has
  // never been checked still counts as tracked with an unknown position.
  const latest = new Map<string, { position: number | null; url: string | null }>();
  // Keywords whose position was actually checked at least once. With none,
  // "0 already ranking" would be a claim about Google nobody measured.
  const checkedSet = new Set<string>();
  for (const r of rows) {
    if (r.checkedAt) checkedSet.add(r.keyword);
    if (!latest.has(r.keyword))
      latest.set(r.keyword, { position: r.position ?? null, url: r.url ?? null });
  }
  // The pages the last crawl read, to name the page a keyword is about
  // before Google ranks it (lib/keyword-relevance.ts, bestPageFor).
  const sitePages = await crawledPagesOf(clientId);

  const positions = [...latest.values()].map((v) => v.position);
  return {
    tracked: latest.size,
    checked: checkedSet.size,
    ranking: positions.filter((p) => p !== null).length,
    inTopTen: positions.filter((p) => p !== null && p <= 10).length,
    strikingDistance: positions.filter((p) => p !== null && p > 10 && p <= 20)
      .length,
    examples: [...latest.entries()]
      .sort((a, b) => (a[1].position ?? 999) - (b[1].position ?? 999))
      .slice(0, 3)
      .map(([keyword, v]) => ({ keyword, position: v.position })),
    // The list itself, not a summary of it.
    //
    // The document said "24 keywords tracked, 6 on page one" and named
    // three of them. A client approving a plan wants to see WHICH words
    // — it is the only part of the document they can check against their
    // own knowledge of their business, and the part they will push back
    // on. Sorted best-first so the ones already working lead, with the
    // not-yet-ranking ones last where the work is.
    map: [...latest.entries()]
      .map(([keyword, v]) => ({
        keyword,
        intent: classifyIntent(keyword),
        position: v.position,
        // Where it ranks today, if it does. A keyword with no page yet
        // is the honest signal that something has to be written, so it
        // says so rather than being left blank.
        targetPage: v.url ? pathOf(v.url) : bestPageFor(keyword, sitePages),
      }))
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999)),
  };
}

/** Page addresses the reference crawl read (lib/reference-audit.ts). */
async function crawledPagesOf(clientId: number): Promise<string[]> {
  const done = await db
    .select({ kind: audits.kind, mode: audits.mode, rawReport: audits.rawReport })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));
  const { latest } = pickReferenceAudits(done);
  const pages = (latest?.rawReport as { coverage?: { pages?: unknown } } | null)?.coverage?.pages;
  return Array.isArray(pages) ? pages.filter((p): p is string => typeof p === "string") : [];
}

/** Just the path, so a table of URLs stays readable at PDF width. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/" : u.pathname.replace(/[/]+$/, "");
  } catch {
    return url;
  }
}

/**
 * The plan, grouped into weeks from the tasks that were actually created
 * for this client — not the static "Week 1: technical baseline" text the
 * wizard used to show next to the button, which said the same thing for
 * every client regardless of what their plan contained.
 */
async function timelineFor(clientId: number) {
  const rows = await db
    .select({
      title: tasks.title,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
    })
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const dated = rows
    .filter((r): r is typeof r & { dueDate: Date } => r.dueDate !== null)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  if (dated.length === 0) return [];

  const start = dated[0].dueDate.getTime();
  const DAY = 86_400_000;
  const byWeek = new Map<number, string[]>();
  for (const t of dated) {
    const week = Math.floor((t.dueDate.getTime() - start) / (7 * DAY)) + 1;
    // 13 weeks, not 8. A document headed "the first 90 days" that
    // silently dropped everything past week 8 was showing 56 days of it
    // and calling that the plan.
    if (week > 13) continue;
    const arr = byWeek.get(week) ?? [];
    if (arr.length < 5) arr.push(t.title);
    byWeek.set(week, arr);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, items]) => ({
      week: `Week ${week}`,
      focus: focusOf(items),
      items,
      phase: phaseOf(week),
    }));
}

/**
 * The 30 / 60 / 90 phase a week falls in.
 *
 * Weeks alone are a list; phases are a story, and a client reading
 * "Week 7" has no idea whether that is still setup or already growth.
 * The names are the ones agencies actually use, but the CONTENTS stay
 * derived from real tasks — the wizard used to print a hardcoded
 * "Week 1: technical baseline, Week 2: GSC quick-wins" for every client
 * alike, and a phase label is only an improvement if it does not
 * reintroduce that.
 */
function phaseOf(week: number): string {
  if (week <= 4) return "Foundation · days 1-30";
  if (week <= 9) return "Content and authority · days 31-60";
  return "Compound growth · days 61-90";
}

/**
 * A short label for a week, taken from what is actually in it.
 *
 * Order matters. On-page tags — title, meta description, h1, viewport,
 * canonical, alt text — are technical work, but every one of those words
 * also appears in content tasks, so the technical test has to run first.
 * It didn't at first, and a real generated plan described "add a viewport
 * meta tag" as content work in a document a client reads.
 */
function focusOf(items: string[]): string {
  const text = items.join(" ").toLowerCase();
  if (
    /redirect|speed|core web|crawl|index|schema|sitemap|robots|viewport|canonical|<title>|title tag|meta description|h1|alt text|https|ssl|404/.test(
      text,
    )
  )
    return "technical foundations";
  if (/keyword|rank|serp|search/.test(text)) return "keywords and rankings";
  if (/blog|article|write|draft|publish|content/.test(text)) return "content";
  if (/link|outreach|backlink/.test(text)) return "links and outreach";
  if (/gbp|local|review|citation/.test(text)) return "local presence";
  return "ongoing work";
}

function fallbackIntro(
  name: string,
  baseline: { tracked: number; checked: number; ranking: number },
  weeks: number,
  fr = false,
): string {
  if (fr) {
    const suivi =
      baseline.tracked === 0
        ? ""
        : baseline.checked > 0
          ? ` Nous suivons ${baseline.tracked} recherches pour vous, dont ${baseline.ranking} où votre site apparaît déjà sur Google.`
          : ` Nous suivons ${baseline.tracked} recherches pour vous ; leurs positions seront mesurées dès le premier relevé.`;
    return (
      `Nous avons passé en revue le site de ${name}, et voici ce que nous proposons de faire à partir de ce que nous avons trouvé.` +
      suivi +
      (weeks > 0
        ? ` Le plan ci-dessous couvre les ${weeks} prochaines semaines, en commençant par ce qui bloque tout le reste.`
        : "")
    );
  }
  const tracked =
    baseline.tracked === 0
      ? ""
      : baseline.checked > 0
        ? ` We're tracking ${baseline.tracked} search terms for you, ${baseline.ranking} of which already show up in Google.`
        : ` We're tracking ${baseline.tracked} search terms for you; their positions will be measured at the first check.`;
  return (
    `We've been through ${name}'s site and this is what we'd like to do about what we found.` +
    tracked +
    (weeks > 0
      ? ` The plan below covers the next ${weeks} ${weeks === 1 ? "week" : "weeks"}, starting with the things that block everything else.`
      : "")
  );
}
