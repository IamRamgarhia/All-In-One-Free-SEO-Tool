"use server";

import { actionTx } from "@/lib/action-tx";
import { inferTargeting, isDefaultTargeting } from "@/lib/infer-targeting";
import { rankByRelevance } from "@/lib/keyword-relevance";
import { requireSignedIn } from "@/lib/action-guard";

import { revalidatePath } from "next/cache";
import { isSurfaceId } from "@/lib/engagement-surfaces";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  audits,
  auditIssues,
  clients,
  keywords,
  tasks,
  type Task,
} from "@/db/schema";
import { appendResearchLog, ensureSiteRead } from "@/lib/client-knowledge";
import { discoverKeywords, type DiscoveredKeyword } from "@/lib/auto-keywords";
import { generateCalendar, summariseTopIssues } from "@/lib/seo-calendar";
import { withoutInfrastructure } from "@/lib/infrastructure-urls";
import { getGscQuickWins } from "@/lib/google-data";
import { logActivity } from "@/lib/activity";
import { ymd } from "@/lib/utils-date";

const brandSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  businessType: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  niche: z.enum(["local", "ecommerce", "saas", "blog", "services"]).optional(),
});

export type SaveBrandResult = { ok: boolean; error?: string };

export async function saveBrandStep(
  _prev: SaveBrandResult | null,
  formData: FormData,
): Promise<SaveBrandResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  const parsed = brandSchema.safeParse({
    clientId: formData.get("clientId"),
    description: formData.get("description") ?? undefined,
    businessType: formData.get("businessType") ?? undefined,
    niche: formData.get("niche") || undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? tx("invalidInput") };

  await db
    .update(clients)
    .set({
      description: parsed.data.description ?? null,
      businessType: parsed.data.businessType ?? null,
      niche: parsed.data.niche ?? null,
      onboardingStep: "keywords",
      updatedAt: new Date(),
    })
    .where(eq(clients.id, parsed.data.clientId));

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}/onboarding`);
  return { ok: true };
}

const targetingSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  country: z.string().trim().min(2).max(8),
  language: z.string().trim().min(2).max(10).default("en"),
  city: z.string().trim().max(120).optional().or(z.literal("").transform(() => undefined)),
  geoTarget: z.enum(["country", "city", "multi"]).default("country"),
  serviceRadiusKm: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function saveTargetingStep(
  _prev: SaveBrandResult | null,
  formData: FormData,
): Promise<SaveBrandResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  const parsed = targetingSchema.safeParse({
    clientId: formData.get("clientId"),
    country: formData.get("country"),
    language: formData.get("language") || "en",
    city: formData.get("city") ?? undefined,
    geoTarget: formData.get("geoTarget") || "country",
    serviceRadiusKm: formData.get("serviceRadiusKm") ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? tx("invalidInput") };

  await db
    .update(clients)
    .set({
      country: parsed.data.country.toUpperCase(),
      language: parsed.data.language,
      city: parsed.data.city ?? null,
      geoTarget: parsed.data.geoTarget,
      serviceRadiusKm: parsed.data.serviceRadiusKm ?? null,
      onboardingStep: "surfaces",
      updatedAt: new Date(),
    })
    .where(eq(clients.id, parsed.data.clientId));

  // The keywords picked at the previous step were saved with the targeting
  // the client had then. The ones never checked yet follow the targeting
  // chosen now; a keyword with a ranking history keeps its own, so its
  // positions stay comparable.
  await db
    .update(keywords)
    .set({
      country: parsed.data.country.toUpperCase(),
      language: parsed.data.language,
      city: parsed.data.city ?? null,
    })
    .where(
      and(
        eq(keywords.clientId, parsed.data.clientId),
        sql`not exists (select 1 from keyword_rankings kr where kr.keyword_id = ${keywords.id})`,
      ),
    );

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}/onboarding`);
  return { ok: true };
}

/**
 * Step 4 — what this engagement covers.
 *
 * The one thing a client signing off asks that nothing here could
 * answer: what are you actually going to work on? Niche, locale and tech
 * stack were all collected and none of them say whether we touch their
 * Google Business Profile or their product pages.
 *
 * An empty selection is allowed and stored as an empty array, which is
 * NOT the same as the null that means "never asked". The document renders
 * an out-of-scope list, and that list is only honest if declining
 * something and never being offered it stay distinguishable.
 */
export async function saveSurfacesStep(
  _prev: SaveBrandResult | null,
  formData: FormData,
): Promise<SaveBrandResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  const clientId = Number(formData.get("clientId"));
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: tx("invalidClient") };

  const picked = formData
    .getAll("surfaces")
    .map(String)
    .filter((v) => isSurfaceId(v));

  await db
    .update(clients)
    .set({
      surfacesJson: picked,
      onboardingStep: "completed",
      updatedAt: new Date(),
    })
    .where(eq(clients.id, clientId));

  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/onboarding`);
  return { ok: true };
}

// =============== Auto keyword discovery ===============

export type DiscoverState =
  | {
      ok: true;
      keywords: DiscoveredKeyword[];
      gscRowsUsed: number;
      seedsUsed: string[];
      /** What reading the site produced, so the user can see it happened. */
      siteRead: { pagesRead: number; termsFound: number; seeds: string[]; note?: string };
    }
  | { ok: false; error: string };

export async function runKeywordDiscovery(
  _prev: DiscoverState | null,
  formData: FormData,
): Promise<DiscoverState> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  const id = Number(formData.get("clientId"));
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, error: tx("invalidClient2") };

  const [found] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!found) return { ok: false, error: tx("clientNotFound") };

  // A client still on the United States / English defaults has never had
  // its targeting chosen: guess it from its address, phone and domain
  // before researching keywords, and keep it (lib/infer-targeting.ts). A
  // targeting someone set by hand is left alone.
  let c = found;
  if (isDefaultTargeting(found)) {
    const guess = inferTargeting({ url: found.url, address: found.address, phone: found.phone });
    if (guess && (guess.country !== "US" || guess.language !== "en")) {
      await db.update(clients).set({ ...guess, updatedAt: new Date() }).where(eq(clients.id, id));
      c = { ...found, ...guess };
    }
  }

  let domain = "";
  try {
    domain = new URL(/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`).hostname;
  } catch {
    domain = c.url;
  }

  // Read the site once and keep it. Discovery used to read it, use it,
  // and throw it away, so every later run paid for the same thirteen
  // page fetches and the title drafter — which needs exactly this — was
  // still working from a single meta tag.
  const { vocab, fromCache } = await ensureSiteRead({
    clientId: id,
    url: c.url,
    brand: c.name,
  });

  const result = await discoverKeywords({
    clientName: c.name,
    domain,
    niche: c.niche,
    description: c.description,
    city: c.city,
    country: c.country ?? "US",
    businessTypeFromDesc: c.businessType ?? undefined,
    gscProperty: c.gscProperty,
    limit: 60,
    siteVocabulary: vocab ?? undefined,
    // Already read, or deliberately not readable. Either way discovery
    // must not fetch the site a second time inside the same request.
    readSite: false,
  });

  await appendResearchLog(
    id,
    tx("keywordDiscoveryFoundFromSeeds", { length: result.keywords.length, length2: result.seedsUsed.length }) +
      (vocab
        ? `, site read ${fromCache ? "reused" : "fresh"} (${vocab.pagesRead} pages)`
        : ", site could not be read"),
    "app",
  );

  return {
    ok: true,
    // Most relevant to what the business does first: the wizard pre-ticks
    // the top 12 (lib/keyword-relevance.ts).
    keywords: rankByRelevance(result.keywords, {
      name: c.name,
      description: c.description,
      businessType: c.businessType,
      city: c.city,
    }),
    gscRowsUsed: result.gscRowsUsed,
    seedsUsed: result.seedsUsed,
    siteRead: result.siteRead,
  };
}

const acceptKeywordsSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  selected: z.string(), // JSON-encoded array of queries
});

export async function acceptDiscoveredKeywords(
  _prev: SaveBrandResult | null,
  formData: FormData,
): Promise<SaveBrandResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  const parsed = acceptKeywordsSchema.safeParse({
    clientId: formData.get("clientId"),
    selected: formData.get("selected"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? tx("invalidInput") };

  let chosen: string[] = [];
  try {
    chosen = JSON.parse(parsed.data.selected) as string[];
  } catch {
    return { ok: false, error: tx("badSelectionPayload") };
  }
  chosen = chosen
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 200)
    .slice(0, 200);

  if (chosen.length === 0) {
    return { ok: false, error: tx("pickAtLeastOneKeyword") };
  }

  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!c) return { ok: false, error: tx("clientNotFound") };

  // Insert as keyword rows, skipping ones already present (case-insensitive)
  const existing = await db
    .select({ q: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, c.id));
  const existingSet = new Set(existing.map((r) => r.q.toLowerCase()));

  const fresh = chosen.filter((q) => !existingSet.has(q.toLowerCase()));
  if (fresh.length > 0) {
    await db.insert(keywords).values(
      fresh.map((q) => ({
        clientId: c.id,
        query: q,
        country: c.country ?? "US",
        city: c.city,
        language: c.language ?? "en",
        device: "desktop" as const,
        source: "auto_discovery",
      })),
    );
  }

  // Step → targeting
  await db
    .update(clients)
    .set({ onboardingStep: "targeting", updatedAt: new Date() })
    .where(eq(clients.id, c.id));

  revalidatePath(`/clients/${c.id}`);
  revalidatePath(`/clients/${c.id}/onboarding`);
  return { ok: true };
}

// =============== Calendar generation ===============

export type GenerateCalendarResult =
  | { ok: true; tasksCreated: number; planRef: string }
  | { ok: false; error: string };

export async function generateMonthlyCalendar(
  clientId: number,
): Promise<GenerateCalendarResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_onboarding_actions");
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: tx("invalidClient2") };

  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c) return { ok: false, error: tx("clientNotFound") };

  // Pull GSC quick wins for the calendar to pin into days 9-11
  let quickWins: { query: string; impressions: number; position: number }[] = [];
  if (c.gscProperty) {
    try {
      const rows = await getGscQuickWins({
        siteUrl: c.gscProperty,
        days: 28,
        limit: 5,
      });
      quickWins = rows.map((r) => ({
        query: r.query,
        impressions: r.impressions,
        position: r.position,
      }));
    } catch {
      quickWins = [];
    }
  }

  // Pull top open issues from the latest completed audit so days 3-5 of
  // the calendar pin real findings. We grab severity-ranked issues that
  // are still in "new" state (resolved/ignored/false_positive are skipped).
  let topIssues: {
    title: string;
    severity: "critical" | "high" | "medium" | "low";
  }[] = [];
  try {
    const [latestAudit] = await db
      .select({ id: audits.id })
      .from(audits)
      .where(
        and(
          eq(audits.clientId, c.id),
          eq(audits.status, "completed"),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(1);
    if (latestAudit) {
      // No limit before summarising. This took an arbitrary thirty rows
      // and THEN sorted them, so on a site with twenty heading-order rows
      // the critical findings could fall outside the thirty entirely.
      const rows = await db
        .select({
          severity: auditIssues.severity,
          type: auditIssues.type,
          message: auditIssues.message,
          url: auditIssues.url,
        })
        .from(auditIssues)
        .where(
          and(
            eq(auditIssues.auditId, latestAudit.id),
            eq(auditIssues.status, "new"),
          ),
        );
      topIssues = summariseTopIssues(withoutInfrastructure(rows), 5);
    }
  } catch {
    topIssues = [];
  }

  const planRef = `plan-${ymd(new Date())}`;

  const calendar = generateCalendar({
    clientId: c.id,
    clientName: c.name,
    niche: c.niche,
    techStack: c.techStack ?? [],
    country: c.country ?? "US",
    city: c.city,
    hasGsc: Boolean(c.gscProperty),
    hasGbp: Boolean(c.gbpUrl),
    quickWins,
    topIssues,
  });

  // Wipe any prior auto-generated tasks for the same plan tag (re-run safety)
  await db
    .delete(tasks)
    .where(
      sql`${tasks.clientId} = ${c.id} AND ${tasks.source} = 'auto_calendar' AND ${tasks.status} = 'todo'`,
    );

  // Insert as tasks
  // Attribution columns omitted: the calendar generates these, not a
  // person, so they start unassigned.
  const rows: Omit<
    Task,
    "id" | "createdAt" | "updatedAt" | "assignedUserId" | "completedByUserId"
  >[] = calendar.map(
    (t) => ({
      clientId: c.id,
      title: t.title,
      // The path goes in its own column now, so the description is free
      // for something a person wrote rather than a link rendered as text.
      description: null,
      toolPath: t.toolPath ?? null,
      whyItMatters: t.whyItMatters,
      priority: t.priority,
      status: "todo",
      dueDate: t.date,
      recurringInterval: null,
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: null,
      source: "auto_calendar",
      sourceRef: planRef,
      // A calendar step is not about a list of pages.
      pages: null,
    }),
  );

  if (rows.length > 0) {
    await db.insert(tasks).values(rows);
  }

  // Quick-wins: scan the latest audit, drop the easy high-impact issues
  // straight onto the board so the user opens the tasks page and sees a
  // "Fix today" punch list.
  try {
    const { applyQuickWins } = await import("@/lib/quick-wins");
    await applyQuickWins({ clientId: c.id });
  } catch {
    // ignore
  }

  // Auto-suggest competitors via SERP overlap: take the top 5 chosen
  // keywords + run a search, collect the most-recurring non-client
  // domains as competitor candidates and persist them.
  try {
    const { suggestCompetitorsFromKeywords } = await import(
      "@/lib/competitor-suggest"
    );
    await suggestCompetitorsFromKeywords({ clientId: c.id });
  } catch {
    // ignore
  }

  // Capture the baseline snapshot now so the next monthly report can show
  // "since you started" delta. Best-effort — failure shouldn't block plan
  // generation.
  try {
    const { captureClientSnapshot } = await import("@/lib/client-snapshots");
    await captureClientSnapshot({ clientId: c.id, kind: "baseline" });
  } catch {
    // ignore
  }

  await db
    .update(clients)
    .set({
      planGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, c.id));

  await logActivity({
    kind: "task.created",
    message: tx("generated30DaySeoCalendar", { length: rows.length }),
    level: "success",
    clientId: c.id,
    entityType: "calendar",
    entityId: c.id,
  });

  revalidatePath(`/clients/${c.id}`);
  revalidatePath("/tasks");
  return { ok: true, tasksCreated: rows.length, planRef };
}

export async function skipOnboarding(clientId: number): Promise<void> {
  await requireSignedIn();
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  await db
    .update(clients)
    .set({ onboardingStep: "completed", updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/onboarding`);
}

/**
 * Top learned AI style rules for this client (workspace + client-scoped),
 * surfaced in the onboarding step 4 summary so the user can see what the
 * tool has learned before generating the plan.
 */
export async function getLearnedRulesForClient(
  clientId: number,
): Promise<{ rule: string; confidence: string; feature: string }[]> {
  await requireSignedIn();
  const { aiPreferences } = await import("@/db/schema");
  const { and, isNull, or, eq: drizzleEq, desc: drizzleDesc } = await import("drizzle-orm");
  // Scoped to workspace-wide rules (client_id IS NULL) plus this
  // client's own. The previous version imported `isNull` and `or`,
  // commented that it would "filter post-fetch since the limit's tiny",
  // and then `void`-ed both and returned every row — so the onboarding
  // summary showed one client's learned style rules under another
  // client's name, and the LIMIT 10 meant a busy client could crowd out
  // the rules that actually applied.
  const rows = await db
    .select({
      rule: aiPreferences.rule,
      confidence: aiPreferences.confidence,
      feature: aiPreferences.feature,
    })
    .from(aiPreferences)
    .where(
      and(
        drizzleEq(aiPreferences.active, true),
        or(
          isNull(aiPreferences.clientId),
          drizzleEq(aiPreferences.clientId, clientId),
        ),
      ),
    )
    .orderBy(drizzleDesc(aiPreferences.confidence))
    .limit(10);
  return rows;
}

// =============== Background audit progress ===============

export type AuditProgress = {
  status: "none" | "queued" | "running" | "completed" | "failed";
  /** Pages fetched so far. Written by runAuditForClient as the crawl runs. */
  pagesCrawled: number;
  /** The crawler's default cap. Only used to draw the bar. */
  maxPages: number;
  score: number | null;
  issuesCount: number;
  auditId: number | null;
};

/**
 * Progress of the site crawl kicked off when the client was created.
 *
 * Polled by the wizard so a multi-minute crawl looks like work in
 * progress rather than a page that has stopped responding.
 */
export async function getAuditProgress(
  clientId: number,
): Promise<AuditProgress> {
  await requireSignedIn();
  const [row] = await db
    .select({
      id: audits.id,
      status: audits.status,
      pagesCrawled: audits.pagesCrawled,
      score: audits.score,
      issuesCount: audits.issuesCount,
    })
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.kind, "crawler")))
    .orderBy(desc(audits.id))
    .limit(1);

  if (!row) {
    return {
      status: "none",
      pagesCrawled: 0,
      maxPages: 25,
      score: null,
      issuesCount: 0,
      auditId: null,
    };
  }

  return {
    status: row.status,
    pagesCrawled: row.pagesCrawled ?? 0,
    // Mirrors runAudit's default. Shown as "of 25", never as a promise
    // that 25 pages exist — small sites finish early and that is fine.
    maxPages: 25,
    score: row.score,
    issuesCount: row.issuesCount,
    auditId: row.id,
  };
}
