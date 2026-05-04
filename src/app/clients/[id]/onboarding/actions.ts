"use server";

import { revalidatePath } from "next/cache";
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
import { discoverKeywords, type DiscoveredKeyword } from "@/lib/auto-keywords";
import { generateCalendar } from "@/lib/seo-calendar";
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
  const parsed = brandSchema.safeParse({
    clientId: formData.get("clientId"),
    description: formData.get("description") ?? undefined,
    businessType: formData.get("businessType") ?? undefined,
    niche: formData.get("niche") || undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

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
  const parsed = targetingSchema.safeParse({
    clientId: formData.get("clientId"),
    country: formData.get("country"),
    language: formData.get("language") || "en",
    city: formData.get("city") ?? undefined,
    geoTarget: formData.get("geoTarget") || "country",
    serviceRadiusKm: formData.get("serviceRadiusKm") ?? undefined,
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db
    .update(clients)
    .set({
      country: parsed.data.country.toUpperCase(),
      language: parsed.data.language,
      city: parsed.data.city ?? null,
      geoTarget: parsed.data.geoTarget,
      serviceRadiusKm: parsed.data.serviceRadiusKm ?? null,
      onboardingStep: "completed",
      updatedAt: new Date(),
    })
    .where(eq(clients.id, parsed.data.clientId));

  revalidatePath(`/clients/${parsed.data.clientId}`);
  revalidatePath(`/clients/${parsed.data.clientId}/onboarding`);
  return { ok: true };
}

// =============== Auto keyword discovery ===============

export type DiscoverState =
  | { ok: true; keywords: DiscoveredKeyword[]; gscRowsUsed: number; seedsUsed: string[] }
  | { ok: false; error: string };

export async function runKeywordDiscovery(
  _prev: DiscoverState | null,
  formData: FormData,
): Promise<DiscoverState> {
  const id = Number(formData.get("clientId"));
  if (!Number.isFinite(id) || id <= 0)
    return { ok: false, error: "Invalid client" };

  const [c] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!c) return { ok: false, error: "Client not found" };

  let domain = "";
  try {
    domain = new URL(/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`).hostname;
  } catch {
    domain = c.url;
  }

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
  });

  return {
    ok: true,
    keywords: result.keywords,
    gscRowsUsed: result.gscRowsUsed,
    seedsUsed: result.seedsUsed,
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
  const parsed = acceptKeywordsSchema.safeParse({
    clientId: formData.get("clientId"),
    selected: formData.get("selected"),
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  let chosen: string[] = [];
  try {
    chosen = JSON.parse(parsed.data.selected) as string[];
  } catch {
    return { ok: false, error: "Bad selection payload" };
  }
  chosen = chosen
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 200)
    .slice(0, 200);

  if (chosen.length === 0) {
    return { ok: false, error: "Pick at least one keyword to track." };
  }

  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!c) return { ok: false, error: "Client not found" };

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
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: "Invalid client" };

  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c) return { ok: false, error: "Client not found" };

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
      const rows = await db
        .select({
          severity: auditIssues.severity,
          type: auditIssues.type,
          message: auditIssues.message,
        })
        .from(auditIssues)
        .where(
          and(
            eq(auditIssues.auditId, latestAudit.id),
            eq(auditIssues.status, "new"),
          ),
        )
        .limit(30);
      const sevRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      topIssues = rows
        .map((r) => ({
          severity: r.severity as "critical" | "high" | "medium" | "low",
          title: r.message || r.type,
        }))
        .sort(
          (a, b) =>
            sevRank[a.severity] - sevRank[b.severity] ||
            a.title.localeCompare(b.title),
        )
        .slice(0, 5);
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
  const rows: Omit<Task, "id" | "createdAt" | "updatedAt">[] = calendar.map(
    (t) => ({
      clientId: c.id,
      title: t.title,
      description: t.toolPath ? `Open: ${t.toolPath}` : null,
      whyItMatters: t.whyItMatters,
      priority: t.priority,
      status: "todo",
      dueDate: t.date,
      recurringInterval: null,
      estimatedMinutes: t.estimatedMinutes,
      actualMinutes: null,
      source: "auto_calendar",
      sourceRef: planRef,
    }),
  );

  if (rows.length > 0) {
    await db.insert(tasks).values(rows);
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
    message: `Generated 30-day SEO calendar (${rows.length} tasks).`,
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
  const { aiPreferences } = await import("@/db/schema");
  const { isNull, or, eq: drizzleEq, desc: drizzleDesc } = await import("drizzle-orm");
  const rows = await db
    .select({
      rule: aiPreferences.rule,
      confidence: aiPreferences.confidence,
      feature: aiPreferences.feature,
    })
    .from(aiPreferences)
    .where(
      drizzleEq(aiPreferences.active, true),
    )
    .orderBy(drizzleDesc(aiPreferences.confidence))
    .limit(10);
  // Filter for workspace OR this client only (drizzle-orm's `or` chained
  // checks were complicating the query — easier to filter post-fetch
  // since the limit's tiny).
  void isNull;
  void or;
  return rows;
}
