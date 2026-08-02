export const dynamic = "force-dynamic";

import { Plug } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { configuredProviders } from "@/lib/api-keys";
import { getBingApiKey } from "@/lib/bing-webmaster";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { getSetting } from "@/lib/settings-store";
import { INTEGRATIONS, type IntegrationStatus } from "@/lib/integrations";
import { ConnectList } from "./list";

/**
 * One page that answers "what can I connect, why would I, and how?"
 *
 * Setup guidance existed but was scattered across six places, so a user
 * had to already know a thing existed to go and configure it. Worse,
 * the backlink import told people to add their Bing key "in Settings",
 * where it isn't.
 */
export default async function ConnectPage() {
  const status = await currentStatus();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Connect your accounts"
        description="Everything this tool can plug into, what each one actually gets you, and how to set it up. All the ones that matter are free."
        icon={Plug}
        accent="cyan"
      />
      <ConnectList integrations={INTEGRATIONS} status={status} />
    </div>
  );
}

/**
 * Live status per integration.
 *
 * Every check is wrapped: a broken integration must not stop the page
 * that exists to help you fix it from rendering. "unknown" is an honest
 * third state — better than showing "not connected" for something we
 * simply failed to check.
 */
async function currentStatus(): Promise<Record<string, IntegrationStatus>> {
  const out: Record<string, IntegrationStatus> = {};

  const safe = async (id: string, check: () => Promise<boolean>) => {
    try {
      out[id] = (await check()) ? "connected" : "not-connected";
    } catch {
      out[id] = "unknown";
    }
  };

  await Promise.all([
    safe("ai", async () => (await configuredProviders()).ids.length > 0),
    safe("google", async () => (await getGoogleConnectionStatus()).connected),
    safe("bing", async () => (await getBingApiKey()) !== null),
    safe("pagespeed", async () => {
      // "api.pagespeed" — the key this app actually stores it under.
      // Guessing the name would have shown "not connected" forever for
      // someone who had already set it up, which is worse than not
      // showing a status at all.
      const stored = await getSetting<string>("api.pagespeed");
      return Boolean(stored) || Boolean(process.env.PAGESPEED_API_KEY);
    }),
    safe("wordpress", async () => {
      const rows = await db
        .select({ id: clients.id })
        .from(clients)
        .where(isNotNull(clients.wpEndpoint))
        .limit(1);
      return rows.length > 0;
    }),
    safe("smtp", async () => Boolean(await getSetting<string>("smtp.host"))),
  ]);

  return out;
}
