export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { getSetting } from "@/lib/settings-store";
import { isSerpProvider } from "@/lib/serp-api";
import { requireSettingsPage } from "../access";
import { SectionHeader } from "../section-ui";
import { SerpForm } from "./serp-form";

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

  return (
    <>
      <SectionHeader
        title={t("title")}
        description={t("description")}
        status={{ label: initial.provider ? t("statusApi") : t("statusBrowser"), ok: Boolean(initial.provider) }}
      />
      <SerpForm initial={initial} />
    </>
  );
}
