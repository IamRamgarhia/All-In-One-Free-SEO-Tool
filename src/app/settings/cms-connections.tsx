import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { asc } from "drizzle-orm";
import { WP_PLUGIN_ZIP_URL } from "@/lib/repo";
import { WpBridgePanel } from "@/app/clients/[id]/wp-bridge-panel";
import { wpBridgeProblems } from "@/lib/wp-bridge-problem";

/**
 * Every client's CMS connection, in one place.
 *
 * WHY THIS SECTION EXISTS: the WordPress plugin's own admin page says
 *
 *   "Paste this into SEO Tool → Settings → CMS connections."
 *
 * and there was no such page. The fields lived on the client page's
 * Site tab, four clicks away and findable only if you already knew.
 * The maintainer of this project installed the plugin, read that line,
 * went to Settings, and could not find where the key goes — which is
 * the single step the whole one-click-fix feature depends on.
 *
 * Two ways to fix a document that names the wrong place: change the
 * document, or make the place exist. The place should exist: Settings
 * is where people look for "connect a thing", which is why Google and
 * email are already here.
 *
 * It renders the SAME panel the client page does rather than a second
 * copy of the form — a connection screen that drifts from the other
 * connection screen is this project's most-repeated bug.
 *
 * `cms-connection-contract.test.ts` asserts the plugin's instruction
 * and this section's id still agree.
 */
export async function CmsConnections() {
  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      wpEndpoint: clients.wpEndpoint,
      wpKey: clients.wpKey,
      techStack: clients.techStack,
    })
    .from(clients)
    .orderBy(asc(clients.name));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No clients yet. Add one first, then come back here to connect its
        CMS.
      </p>
    );
  }

  const problems = await wpBridgeProblems(rows.map((r) => r.id));
  // "Connected" here means the last check could actually reach it — not
  // merely that a key is stored. The two are not the same, and treating
  // them as the same is what let this install report a working bridge to
  // a site with no plugin on it.
  const connected = rows.filter(
    (r) => r.wpEndpoint && r.wpKey && !problems.has(r.id),
  ).length;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/5 bg-black/20 p-4 text-sm">
        <p className="text-muted-foreground">
          Connecting a site lets this tool apply fixes directly — titles,
          meta descriptions, alt text, schema — instead of handing you text
          to paste. Every change previews first and can be undone.
        </p>
        <p className="mt-3 text-muted-foreground">
          <strong className="text-foreground">WordPress:</strong> install the
          bridge plugin, then open{" "}
          <span className="text-foreground">Tools → SEO Tool Bridge</span> in
          WordPress and copy the endpoint and key into the matching site
          below.
        </p>
        <a
          href={WP_PLUGIN_ZIP_URL}
          className="mt-3 inline-flex items-center gap-1.5 text-primary hover:underline"
        >
          Download the plugin zip <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <p className="mt-3 text-xs text-muted-foreground">
          {connected} of {rows.length}{" "}
          {rows.length === 1 ? "site is" : "sites are"} connected.
        </p>
      </div>

      {rows.map((c) => (
        <div key={c.id} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{c.name}</h3>
            <Link
              href={`/clients/${c.id}#client-site-panel`}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Open this client →
            </Link>
          </div>
          <WpBridgePanel
            clientId={c.id}
            isConnected={Boolean(c.wpEndpoint && c.wpKey)}
            endpoint={c.wpEndpoint ?? null}
            looksLikeWordPress={(c.techStack ?? []).some((t) =>
              String(t).toLowerCase().includes("wordpress"),
            )}
            problem={problems.get(c.id) ?? null}
          />
        </div>
      ))}
    </div>
  );
}
