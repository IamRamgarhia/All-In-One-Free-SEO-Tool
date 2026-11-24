export const dynamic = "force-dynamic";

import { getTranslations } from "next-intl/server";
import { canManageSettings } from "@/lib/auth";
import { getAiAvailability } from "@/lib/ai-availability";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { capabilityOf } from "@/lib/tool-capabilities";
import { aiNeedOf } from "@/lib/connection-coverage";
import { toolReadiness } from "@/lib/tool-readiness";
import { getDisabledTools } from "@/lib/tool-activation";
import { TOOL_CATALOG } from "@/lib/tool-catalog";
import { requireSettingsPage } from "../access";
import { SectionHeader } from "../section-ui";
import { familyOf } from "@/lib/tool-families";
import { ToolsPanel, type ToolCard } from "./tools-panel";

/**
 * Settings → Tools: the catalogue of every tool, grouped by kind of
 * mission. A card says whether the tool is ready, needs setup, or is
 * turned off; its sheet lists what it needs and holds the on/off switch.
 * Tools are used from projects, missions and search, not from here.
 */
export default async function ToolsSettingsPage() {
  const me = await requireSettingsPage("/settings/tools");
  const isAdmin = !me || canManageSettings(me.role);
  const t = await getTranslations("settings.tools");

  const [disabled, ai, google] = await Promise.all([
    getDisabledTools(),
    getAiAvailability(),
    getGoogleConnectionStatus().catch(() => ({ connected: false })),
  ]);

  const cards: ToolCard[] = TOOL_CATALOG.map((e) => {
    const cap = capabilityOf(e.href);
    // Same rule as the connection screens (connection-coverage.ts), so a
    // tool they name as needing a key is the one shown here as needing setup.
    const aiUsage = aiNeedOf(e.href);
    const missingGsc = e.needs === "gsc" && !google.connected;
    const blocked =
      toolReadiness({ href: e.href, hasAiKey: ai.available, needs: missingGsc ? "gsc" : null })
        .state === "blocked";
    const off = disabled.has(e.href);
    // A family is ready when its entry is; its other tabs only add
    // "some features use the browser" to the sheet.
    const tabs = (familyOf(e.href)?.family.members ?? []).map((m) => capabilityOf(m.href));
    return {
      href: e.href,
      category: e.category,
      aiUsage,
      usesBrowser: Boolean(cap?.usesBrowser) || tabs.some((c) => c?.usesBrowser),
      needsGsc: e.needs === "gsc",
      offByDefault: Boolean(e.offByDefault),
      state: off ? "off" : blocked ? "setup" : "ready",
    };
  });

  return (
    <>
      <SectionHeader title={t("title")} description={t("description")} />
      <ToolsPanel
        cards={cards}
        canToggle={isAdmin}
        hasAiKey={ai.available}
        gscConnected={google.connected}
      />
    </>
  );
}
