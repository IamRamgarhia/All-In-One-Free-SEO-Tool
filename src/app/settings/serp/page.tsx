export const dynamic = "force-dynamic";

import { count, isNotNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { getSetting } from "@/lib/settings-store";
import { isSerpProvider } from "@/lib/serp-api";
import { getSearxngUrl } from "@/lib/serp";
import { requireSettingsPage } from "../access";
import { SectionHeader } from "../section-ui";
import { SerpForm } from "./serp-form";
import { RankSourcesPanel } from "./rank-sources";

/**
 * Settings → Rank sources: where keyword positions come from.
 *
 * One screen for every source, in the order the chain tries them
 * (lib/rank-resolve.ts). Free sources first, SearXNG recommended; the
 * paid results API last and labelled optional — the tool works without
 * any key.
 */
export default async function SerpSettingsPage() {
  await requireSettingsPage("/settings/serp", { owner: true });
  const t = await getTranslations("settings.serp");

  const provider = await getSetting<string>("serp.provider");
  const initial = {
    provider: isSerpProvider(provider) ? provider : null,
    hasSerperKey: Boolean(await getSetting<string>("serp.serper_key")),
    dataforseoLogin: (await getSetting<string>("serp.dataforseo_login")) ?? null,
    hasDataforseoPassword: Boolean(await getSetting<string>("serp.dataforseo_password")),
  };

  const [{ value: clientCount }] = await db.select({ value: count() }).from(clients);
  const [{ value: gscCount }] = await db
    .select({ value: count() })
    .from(clients)
    .where(isNotNull(clients.gscProperty));
  const searxng = await getSearxngUrl();
  const braveStored = await getSetting<string>("serp.brave_key");
  const braveEnv = Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());

  const sources = {
    gsc: { connected: gscCount, total: clientCount },
    searxng: searxng ? { url: searxng.url, from: searxng.from } : null,
    brave: braveStored ? ("settings" as const) : braveEnv ? ("env" as const) : null,
    browserDisabled: Boolean(await getSetting<boolean>("browser.disable_rank_check")),
    cdpUrl: (await getSetting<string>("browser.cdp_url")) ?? "",
    api: initial.provider,
  };

  return (
    <>
      <SectionHeader
        title={t("title")}
        description={t("description")}
        status={{
          label: searxng ? t("statusSearxng") : t("statusDefault"),
          ok: Boolean(searxng),
        }}
      />
      <RankSourcesPanel sources={sources} />
      <SerpForm initial={initial} />
    </>
  );
}
