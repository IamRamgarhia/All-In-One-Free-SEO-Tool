"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireClientAccess } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, dailySchedules, type NewDailySchedule } from "@/db/schema";
import type { WooShopErrorCode } from "@/lib/woo-products";

/** Google Business Profile post lengths offered in the editor (Google's own cap is 1500). */
const GBP_LENGTHS = [300, 600, 1000, 1500] as const;

export type WooShopCheck =
  | { ok: true; site: string; count: number }
  | { ok: false; site: string | null; code: WooShopErrorCode | "no_products" };

/**
 * Can this client's site feed product posts? Reads the public WooCommerce
 * Store API (no keys) and counts in-stock products that have a photo.
 */
async function wooShopCheck(clientId: number): Promise<WooShopCheck> {
  const [client] = await db
    .select({ url: clients.url, language: clients.language })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const { listWooProducts, shopBaseUrl, WooShopError } = await import("@/lib/woo-products");
  const site = shopBaseUrl(client?.url);
  try {
    const products = (
      await listWooProducts(client?.url, { locale: client?.language ?? "en" })
    ).filter((p) => p.imageUrl);
    return products.length > 0
      ? { ok: true, site: site ?? "", count: products.length }
      : { ok: false, site, code: "no_products" };
  } catch (err) {
    return {
      ok: false,
      site,
      code: err instanceof WooShopError ? err.code : "unreachable",
    };
  }
}

export async function checkWooShop(clientId: number): Promise<WooShopCheck> {
  await requireSignedIn();
  await requireClientAccess(clientId);
  return wooShopCheck(clientId);
}

const WOO_ERROR_KEY = {
  no_url: "wooNoUrl",
  unreachable: "wooUnreachable",
  not_woo: "wooNotWoo",
  no_products: "wooNoProducts",
} as const;

export type CreateScheduleState =
  | { ok: true; id: number }
  | { ok: false; error: string }
  | null;

export async function createSchedule(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_automations_actions");
  const clientId = Number(formData.get("clientId"));
  const kind = String(formData.get("kind") ?? "");
  const cadenceDays = Math.max(1, Math.min(90, Number(formData.get("cadenceDays") ?? 1)));
  const timeUtc = Math.max(0, Math.min(2359, Number(formData.get("timeUtc") ?? 900)));
  const autoPublishRaw = formData.get("autoPublish") === "on";
  const topicSeed = String(formData.get("topicSeed") ?? "").slice(0, 200);
  const tone = String(formData.get("tone") ?? "").slice(0, 200);
  const aiBrief = String(formData.get("aiBrief") ?? "").trim().slice(0, 2000);
  const gbpLocationName = String(formData.get("gbpLocationName") ?? "").slice(0, 200);
  const postType = String(formData.get("postType") ?? "STANDARD");
  const gbpSource =
    formData.get("gbpSource") === "woo_product" ? "woo_product" : "topic";
  const maxCharsRaw = Number(formData.get("maxChars") ?? 600);
  const maxChars = (GBP_LENGTHS as readonly number[]).includes(maxCharsRaw)
    ? maxCharsRaw
    : 600;
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
    return { ok: false, error: tx("badClient") };
  }
  if (
    !["blog_draft", "gbp_post", "social_post", "internal_checklist"].includes(
      kind,
    )
  ) {
    return { ok: false, error: tx("pickAKind") };
  }

  // Product posts need a readable WooCommerce shop with something to show;
  // refuse now rather than fail every night.
  if (kind === "gbp_post" && gbpSource === "woo_product") {
    const shop = await wooShopCheck(clientId);
    if (!shop.ok) {
      return {
        ok: false,
        error: tx(WOO_ERROR_KEY[shop.code], { site: shop.site ?? "" }),
      };
    }
  }

  const config: Record<string, unknown> = { destination };
  if (topicSeed) config.topic_seed = topicSeed;
  if (tone) config.tone = tone;
  // Written into the "Download .md for AI" export of this schedule's drafts.
  if (aiBrief && kind === "blog_draft") config.ai_brief = aiBrief;
  if (kind === "gbp_post") {
    if (gbpLocationName) config.gbp_location_name = gbpLocationName;
    config.post_type = postType;
    config.gbp_source = gbpSource;
    config.max_chars = maxChars;
  }

  const insert: NewDailySchedule = {
    clientId,
    kind: kind as NewDailySchedule["kind"],
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

export async function toggleScheduleEnabled(
  scheduleId: number,
  clientId: number,
): Promise<void> {
  await requireSignedIn();
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
  await requireSignedIn();
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
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_automations_actions");
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
  if (!s) return { ok: false, message: tx("scheduleNotFound") };

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
        ? tx("generatedOtherCheckTheReview", { generated: r.generated })
        : tx("nothingWasGeneratedCheckThe"),
  };
}
