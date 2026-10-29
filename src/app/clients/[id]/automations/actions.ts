"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, dailySchedules, type NewDailySchedule } from "@/db/schema";
import { isGbpLocationName } from "@/lib/gbp-api";
import { guardAction } from "@/lib/action-guard";

export type CreateScheduleState =
  | { ok: true; id: number }
  | { ok: false; error: string }
  | null;

/** Config keys the schedule form owns (everything parseScheduleForm can set). */
const FORM_CONFIG_KEYS = [
  "destination",
  "keywords_mode",
  "keywords_custom",
  "blog_source",
  "social_source",
  "button_text",
  "button_text_2",
  "topic_seed",
  "tone",
  "gbp_location_name",
  "post_type",
  "gbp_source",
  "max_chars",
  "cta_type",
  "offer_coupon",
  "ai_brief",
  "claude_prompt",
  "claude_auto_send",
] as const;

type ParsedSchedule = {
  clientId: number;
  kind: NewDailySchedule["kind"];
  cadenceDays: number;
  timeUtc: number;
  autoPublish: boolean;
  config: Record<string, unknown>;
};

/** Read + validate the schedule form; shared by create and edit. */
async function parseScheduleForm(
  formData: FormData,
): Promise<{ ok: true; values: ParsedSchedule } | { ok: false; error: string }> {
  const clientId = Number(formData.get("clientId"));
  const kind = String(formData.get("kind") ?? "");
  const cadenceDays = Math.max(1, Math.min(90, Number(formData.get("cadenceDays") ?? 1)));
  const timeUtc = Math.max(0, Math.min(2359, Number(formData.get("timeUtc") ?? 900)));
  const autoPublishRaw = formData.get("autoPublish") === "on";
  const topicSeed = String(formData.get("topicSeed") ?? "").slice(0, 200);
  const tone = String(formData.get("tone") ?? "").slice(0, 200);
  const aiBrief = String(formData.get("aiBrief") ?? "").trim().slice(0, 2000);
  const claudePrompt = String(formData.get("claudePrompt") ?? "").trim().slice(0, 2000);
  const claudeAutoSend = formData.get("claudeAutoSend") === "on";
  const gbpLocationName = String(formData.get("gbpLocationName") ?? "")
    .trim()
    .slice(0, 200);
  const postType = String(formData.get("postType") ?? "STANDARD");
  const gbpSource =
    formData.get("gbpSource") === "woo_product" ? "woo_product" : "topic";
  const blogSourceRaw = String(formData.get("blogSource") ?? "topic");
  const blogSource =
    blogSourceRaw === "woo_product" || blogSourceRaw === "woo_products"
      ? blogSourceRaw
      : "topic";
  const socialSource =
    formData.get("socialSource") === "woo_product" ? "woo_product" : "topic";
  const keywordsModeRaw = formData.get("keywordsMode");
  const keywordsMode =
    keywordsModeRaw === "custom" || keywordsModeRaw === "planner"
      ? keywordsModeRaw
      : "top";
  const keywordsCustom = String(formData.get("keywordsCustom") ?? "")
    .split(/[,\n;]/)
    .map((k) => k.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const ctaTypeRaw = String(formData.get("ctaType") ?? "auto");
  const ctaType = ["SHOP", "ORDER", "LEARN_MORE", "BOOK", "SIGN_UP", "CALL"].includes(
    ctaTypeRaw,
  )
    ? ctaTypeRaw
    : null;
  const buttonText = String(formData.get("buttonText") ?? "").trim().slice(0, 40);
  const buttonText2 = String(formData.get("buttonText2") ?? "").trim().slice(0, 40);
  const offerCoupon = String(formData.get("offerCoupon") ?? "")
    .trim()
    .slice(0, 58);
  const maxChars = Math.max(
    150,
    Math.min(1000, Number(formData.get("maxChars") ?? 300) || 300),
  );
  // Where the approved item ultimately goes:
  //   "local"     — save in the tool's queue; copy/paste yourself (no integration needed)
  //   "wordpress" — publish via WP bridge plugin
  //   "gbp"       — publish via Google Business Profile API
  const destinationRaw = String(formData.get("destination") ?? "local");
  const destination =
    destinationRaw === "wordpress" || destinationRaw === "gbp"
      ? destinationRaw
      : "local";
  // Local mode is never auto-publish (there's nothing to publish to);
  // suppress the flag if the user toggled it on by mistake.
  const autoPublish = destination === "local" ? false : autoPublishRaw;

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return { ok: false, error: "Bad client." };
  }
  if (
    !["blog_draft", "gbp_post", "social_post", "internal_checklist"].includes(
      kind,
    )
  ) {
    return { ok: false, error: "Pick a kind." };
  }

  // The location becomes a URL path segment. A business name typed here
  // produced `POST /v4/Mono Web/localPosts` and Google's HTML 404 (#43).
  if (kind === "gbp_post" && gbpLocationName && !isGbpLocationName(gbpLocationName)) {
    return {
      ok: false,
      error:
        "The GBP location must look like accounts/…/locations/… — or leave it empty to use the client's listing.",
    };
  }
  if (kind === "gbp_post") {
    const [client] = await db
      .select({ gbpLocationName: clients.gbpLocationName, url: clients.url })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (gbpSource === "woo_product" && !client?.url) {
      return {
        ok: false,
        error:
          "Product posts read the shop's WooCommerce catalogue — add the client's website URL first.",
      };
    }
    if (
      destination === "gbp" &&
      !gbpLocationName &&
      !isGbpLocationName(client?.gbpLocationName)
    ) {
      return {
        ok: false,
        error:
          'This client has no Business Profile listing chosen yet. Pick it under GBP → this client → Reviews ("Which listing"), then create the schedule.',
      };
    }
  }

  if (keywordsMode === "custom" && keywordsCustom.length === 0) {
    return { ok: false, error: "Type at least one keyword, or use the top keywords." };
  }
  if (
    (kind === "blog_draft" && blogSource !== "topic") ||
    (kind === "social_post" && socialSource !== "topic")
  ) {
    const [client] = await db
      .select({ url: clients.url })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client?.url) {
      return {
        ok: false,
        error:
          "Product articles read the shop's WooCommerce catalogue — add the client's website URL first.",
      };
    }
  }

  // Product sources read the shop's public Store API; check it now so a
  // site without WooCommerce fails here, not silently every day.
  const usesProducts =
    (kind === "blog_draft" && blogSource !== "topic") ||
    (kind === "social_post" && socialSource !== "topic") ||
    (kind === "gbp_post" && gbpSource === "woo_product");
  if (usesProducts) {
    const [client] = await db
      .select({ url: clients.url })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    const site = client?.url
      ? /^https?:\/\//i.test(client.url)
        ? client.url
        : `https://${client.url}`
      : null;
    try {
      const { listWooProducts } = await import("@/lib/woo-products");
      const products = site ? await listWooProducts(site, { perPage: 1 }) : [];
      if (products.length === 0) throw new Error("no products");
    } catch {
      return {
        ok: false,
        error:
          "No WooCommerce shop found on this client's website, so product posts can't work. Pick a topic instead.",
      };
    }
  }

  const config: Record<string, unknown> = { destination };
  config.keywords_mode = keywordsMode;
  if (keywordsMode === "custom") config.keywords_custom = keywordsCustom;
  if (kind === "blog_draft") config.blog_source = blogSource;
  if (kind === "social_post") config.social_source = socialSource;
  if (buttonText && (kind === "blog_draft" || kind === "social_post")) {
    config.button_text = buttonText;
  }
  if (buttonText2 && kind === "blog_draft") config.button_text_2 = buttonText2;
  if (topicSeed) config.topic_seed = topicSeed;
  if (tone) config.tone = tone;
  if (aiBrief && kind === "blog_draft") config.ai_brief = aiBrief;
  if (claudePrompt && kind === "blog_draft") {
    config.claude_prompt = claudePrompt;
    if (claudeAutoSend) config.claude_auto_send = true;
  }
  if (kind === "gbp_post") {
    if (gbpLocationName) config.gbp_location_name = gbpLocationName;
    config.post_type = postType;
    config.gbp_source = gbpSource;
    config.max_chars = maxChars;
    if (ctaType) config.cta_type = ctaType;
    if (postType === "OFFER" && offerCoupon) config.offer_coupon = offerCoupon;
  }

  return {
    ok: true,
    values: {
      clientId,
      kind: kind as NewDailySchedule["kind"],
      cadenceDays,
      timeUtc,
      autoPublish,
      config,
    },
  };
}

export async function createSchedule(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await guardAction("edit", formData.get("clientId"));
  const parsed = await parseScheduleForm(formData);
  if (!parsed.ok) return parsed;
  const { clientId, kind, cadenceDays, timeUtc, autoPublish, config } =
    parsed.values;

  const insert: NewDailySchedule = {
    clientId,
    kind,
    cadenceDays,
    timeUtc,
    autoPublish,
    enabled: true,
    configJson: config,
    // Run on the next tick so the user can see it work today
    nextRunAt: new Date(),
  };
  const [row] = await db
    .insert(dailySchedules)
    .values(insert)
    .returning({ id: dailySchedules.id });
  revalidatePath(`/clients/${clientId}/automations`);
  return { ok: true, id: row.id };
}

/** Next UTC occurrence of HHMM: later today if it hasn't passed, else tomorrow. */
function nextOccurrenceUtc(timeUtc: number, from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  next.setUTCHours(Math.floor(timeUtc / 100), timeUtc % 100, 0, 0);
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Edit an existing schedule in place. The kind is fixed (a blog schedule
 * can't become a GBP one — create a new schedule for that); everything
 * else on the form can change. Its generated queue items are untouched.
 */
export async function updateSchedule(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await guardAction("edit", formData.get("clientId"));
  const scheduleId = Number(formData.get("scheduleId"));
  const parsed = await parseScheduleForm(formData);
  if (!parsed.ok) return parsed;
  const { clientId, kind, cadenceDays, timeUtc, autoPublish, config } =
    parsed.values;

  const [existing] = await db
    .select()
    .from(dailySchedules)
    .where(
      and(
        eq(dailySchedules.id, scheduleId),
        eq(dailySchedules.clientId, clientId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false, error: "That schedule no longer exists." };
  if (existing.kind !== kind) {
    return {
      ok: false,
      error: "A schedule's kind can't be changed — create a new schedule instead.",
    };
  }

  // Keep any keys the form doesn't manage; the form's own keys are replaced
  // wholesale so a cleared field really clears.
  const nextConfig = { ...((existing.configJson ?? {}) as Record<string, unknown>) };
  for (const key of FORM_CONFIG_KEYS) delete nextConfig[key];
  Object.assign(nextConfig, config);

  const timingChanged =
    existing.cadenceDays !== cadenceDays || existing.timeUtc !== timeUtc;
  await db
    .update(dailySchedules)
    .set({
      cadenceDays,
      timeUtc,
      autoPublish,
      configJson: nextConfig,
      // A new time/cadence should apply to the next run, not the old slot
      ...(timingChanged ? { nextRunAt: nextOccurrenceUtc(timeUtc) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dailySchedules.id, scheduleId));
  revalidatePath(`/clients/${clientId}/automations`);
  return { ok: true, id: scheduleId };
}

export async function toggleScheduleEnabled(
  scheduleId: number,
  clientId: number,
): Promise<void> {
  await guardAction("edit", clientId);
  const [s] = await db
    .select()
    .from(dailySchedules)
    .where(
      and(
        eq(dailySchedules.id, scheduleId),
        eq(dailySchedules.clientId, clientId),
      ),
    )
    .limit(1);
  if (!s) return;
  await db
    .update(dailySchedules)
    .set({ enabled: !s.enabled, updatedAt: new Date() })
    .where(eq(dailySchedules.id, scheduleId));
  revalidatePath(`/clients/${clientId}/automations`);
}

export async function deleteSchedule(
  scheduleId: number,
  clientId: number,
): Promise<void> {
  await guardAction("edit", clientId);
  await db
    .delete(dailySchedules)
    .where(
      and(
        eq(dailySchedules.id, scheduleId),
        eq(dailySchedules.clientId, clientId),
      ),
    );
  revalidatePath(`/clients/${clientId}/automations`);
}

/**
 * Generate immediately, bypassing the schedule. Useful when the user
 * wants to test a schedule's prompt before letting it run daily.
 */
export async function runScheduleNow(
  scheduleId: number,
  clientId: number,
): Promise<{ ok: boolean; message: string }> {
  await guardAction("edit", clientId);
  const [s] = await db
    .select()
    .from(dailySchedules)
    .where(
      and(
        eq(dailySchedules.id, scheduleId),
        eq(dailySchedules.clientId, clientId),
      ),
    )
    .limit(1);
  if (!s) return { ok: false, message: "Schedule not found." };

  // Forcing nextRunAt to now and ticking — keeps a single code path.
  await db
    .update(dailySchedules)
    .set({ nextRunAt: new Date(), updatedAt: new Date() })
    .where(eq(dailySchedules.id, s.id));
  const { tickScheduleGeneration } = await import("@/lib/daily-automations");
  const r = await tickScheduleGeneration();
  revalidatePath(`/clients/${clientId}/automations`);
  revalidatePath(`/clients/${clientId}/queue`);
  return {
    ok: r.generated > 0,
    message:
      r.generated > 0
        ? `Generated ${r.generated} item${r.generated === 1 ? "" : "s"}. Check the review queue.`
        : "Nothing was generated. Check the activity log for the reason.",
  };
}
