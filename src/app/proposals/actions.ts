"use server";

import { revalidatePath } from "next/cache";
import { splitSurfaces, surfacesFor } from "@/lib/engagement-surfaces";
import { classifyIntent } from "@/lib/keyword-research";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditIssues,
  audits,
  clients,
  graderLeads,
  keywordRankings,
  keywords,
  proposals,
  tasks,
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
  const base = await buildProposal({ clientId });
  if (!base.ok) return base;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "No such client." };

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

  let intro = fallbackIntro(client.name, baseline, planWeeks);
  try {
    const { callAI } = await import("@/lib/ai-call");
    const written = await callAI({
      system:
        "You write the opening paragraph of an SEO plan for a client to approve. " +
        "Plain language, no jargon, no hype, no invented numbers. " +
        "Two or three sentences. Never promise rankings or traffic.",
      user:
        `Client: ${client.name} (${client.url}).\n` +
        `Their site was audited and we found things to fix.\n` +
        `They track ${baseline.tracked} keywords, ${baseline.ranking} of which already rank, ` +
        `${baseline.inTopTen} on page one.\n` +
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
      title: `SEO plan — ${client.name}`,
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
  for (const r of rows) {
    if (!latest.has(r.keyword))
      latest.set(r.keyword, { position: r.position ?? null, url: r.url ?? null });
  }

  const positions = [...latest.values()].map((v) => v.position);
  return {
    tracked: latest.size,
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
        targetPage: v.url ? pathOf(v.url) : null,
      }))
      .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999)),
  };
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
  baseline: { tracked: number; ranking: number },
  weeks: number,
): string {
  const tracked =
    baseline.tracked > 0
      ? ` We're tracking ${baseline.tracked} search terms for you, ${baseline.ranking} of which already show up in Google.`
      : "";
  return (
    `We've been through ${name}'s site and this is what we'd like to do about what we found.` +
    tracked +
    (weeks > 0
      ? ` The plan below covers the next ${weeks} ${weeks === 1 ? "week" : "weeks"}, starting with the things that block everything else.`
      : "")
  );
}
