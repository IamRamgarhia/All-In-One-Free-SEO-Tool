/**
 * What the agent can actually DO for a given client, right now.
 *
 * This exists because the interesting failure mode of an autonomous
 * agent is not "it did the wrong thing" — it is "it confidently planned
 * work it had no way to carry out, and reported success". An agent that
 * proposes rewriting forty titles for a Shopify store it cannot write to
 * has produced a to-do list, not a result, while looking like it did
 * something.
 *
 * So capability detection runs first, and the planner only proposes work
 * the executor can complete. Where a capability is missing, the agent
 * says so in terms of what the user would need to connect — which is far
 * more useful than a silently shorter list of suggestions.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { getClientWpCreds, pingWpBridge } from "../wp-bridge";
import { configuredProviders } from "../api-keys";

export type CapabilityId =
  | "write_title"
  | "write_meta_description"
  | "write_image_alt"
  | "write_schema"
  | "write_internal_links"
  | "write_canonical"
  | "write_robots_meta"
  | "write_robots_txt"
  | "write_redirects"
  | "write_hardening"
  | "read_gsc"
  | "generate_text";

export type Capability = {
  id: CapabilityId;
  available: boolean;
  /** What the user would connect to gain it. Empty when available. */
  missing?: string;
};

export type ClientCapabilities = {
  clientId: number;
  byId: Record<CapabilityId, Capability>;
  /** True when the agent can change anything at all on the live site. */
  canWrite: boolean;
  /** Human-readable list of what's missing, for the control panel. */
  gaps: string[];
};

const WRITE_CAPS: CapabilityId[] = [
  "write_title",
  "write_meta_description",
  "write_image_alt",
  "write_schema",
  "write_internal_links",
];

/**
 * Capabilities the plugin can perform but the planner does not yet ask
 * for, with what is missing on our side.
 *
 * These exist because the endpoint landed before the planning did. That
 * is a legitimate order to build in — the plugin ships to users on its
 * own schedule — but it creates a trap: capability detection would
 * report "needs plugin 0.5.0" to somebody on 0.4.0, sending them to
 * update for a feature that does nothing once they have it.
 *
 * So they are excluded from `gaps`. Nobody is told to go and get
 * something that would not help them.
 *
 * capabilities-coverage.test.ts fails if a write capability is neither
 * planned nor listed here, so this cannot become a place capabilities
 * are quietly parked.
 */
export const NOT_YET_PLANNED: Partial<Record<CapabilityId, string>> = {
  write_redirects:
    "The plugin applies redirects, but nothing turns a broken_link or redirect_chain finding into one yet.",
  write_hardening:
    "The plugin has the toggles, but nothing maps the wp_* findings onto them yet.",
};

export async function detectCapabilities(
  clientId: number,
): Promise<ClientCapabilities> {
  const [client] = await db
    .select({
      id: clients.id,
      gscProperty: clients.gscProperty,
      wpEndpoint: clients.wpEndpoint,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const byId = {} as Record<CapabilityId, Capability>;
  const set = (id: CapabilityId, available: boolean, missing?: string) => {
    byId[id] = { id, available, ...(available ? {} : { missing }) };
  };

  // --- Writing to the site -------------------------------------------
  //
  // Credentials present is not the same as reachable. We ping, because
  // planning a run against a WordPress install that has been moved,
  // taken down, or had its application password rotated would produce a
  // run full of failures — and the user would read that as the agent
  // being broken rather than the connection being stale.
  let wpOk = false;
  let wpError: string | undefined;
  let wpVersion: string | null = null;
  if (client?.wpEndpoint) {
    const creds = await getClientWpCreds(clientId);
    if (!creds) {
      wpError =
        "The saved WordPress key couldn't be decrypted. Re-enter it on the client's settings page.";
    } else {
      const ping = await pingWpBridge(creds);
      wpOk = ping.ok;
      wpVersion = ping.version ?? null;
      if (!ping.ok) {
        wpError = `The WordPress plugin didn't respond (${ping.error ?? "no reason given"}). Check the site is up and the key is still valid.`;
      }
    }
  } else {
    wpError =
      "No CMS connected. Install the WordPress plugin for this client and the agent can apply fixes directly instead of only suggesting them.";
  }

  for (const id of WRITE_CAPS) set(id, wpOk, wpError);

  // Two capabilities need more than a connection: they need a plugin new
  // enough to have the endpoint they depend on.
  //
  // This used to be one flag for every WordPress write, which meant the
  // planner planned alt-text work on every WordPress client and the
  // executor failed all of it. Capability detection exists to prevent
  // exactly that, and a blanket flag defeated it.

  // Plugin 0.3.0 added `GET /post/{id}/images`, which supplies the
  // attachment ids; `expandImageActions` in run.ts turns one page
  // finding into one action per image. Both halves exist now.
  set(
    "write_image_alt",
    wpOk && hasPluginVersion(wpVersion, "0.3.0"),
    wpOk
      ? `This site's SEO Tool Bridge plugin is ${wpVersion ?? "an unknown version"}. Alt text needs 0.3.0 or newer, which added the endpoint that maps an image on a page to its media-library entry. Update the plugin.`
      : wpError,
  );

  // Plugin 0.3.0 added `POST /post/{id}/links`. This is the only write
  // that edits the article body rather than a metadata field, and the
  // guards that make it safe — visible text only, first occurrence,
  // never inside an existing link or heading or code block, and a
  // whole-body revision so undo is exact — all live in the plugin. An
  // older plugin has no endpoint and no revision, so there would be
  // nothing to undo.
  set(
    "write_internal_links",
    wpOk && hasPluginVersion(wpVersion, "0.3.0"),
    wpOk
      ? `This site's SEO Tool Bridge plugin is ${wpVersion ?? "an unknown version"}. Internal linking needs 0.3.0 or newer, which added the endpoint that inserts links safely and records the previous version of the article. Update the plugin.`
      : wpError,
  );

  // Plugin 0.5.0 wired canonical and robots into POST /post/{id}/seo
  // and added the three site-level routes. Before that the handler read
  // neither field, so a canonical sent to an older plugin is accepted,
  // ignored, and answered {ok:true} — the exact silent no-op this
  // version gate exists to prevent.
  const NEW_WRITES: { id: CapabilityId; needs: string }[] = [
    { id: "write_canonical", needs: "canonical tags" },
    { id: "write_robots_meta", needs: "per-page robots directives" },
    { id: "write_robots_txt", needs: "robots.txt" },
    { id: "write_redirects", needs: "redirects" },
    { id: "write_hardening", needs: "WordPress hardening settings" },
  ];
  for (const { id, needs } of NEW_WRITES) {
    set(
      id,
      wpOk && hasPluginVersion(wpVersion, "0.5.0"),
      wpOk
        ? `This site's SEO Tool Bridge plugin is ${wpVersion ?? "an unknown version"}. Writing ${needs} needs 0.5.0 or newer. Update the plugin.`
        : wpError,
    );
  }

  // --- Reading real performance data ---------------------------------
  set(
    "read_gsc",
    Boolean(client?.gscProperty),
    "Search Console isn't connected, so the agent is working from crawl data alone — it can't see which pages are actually losing clicks.",
  );

  // --- Writing copy ---------------------------------------------------
  //
  // Everything above is mechanical. Anything that produces new wording
  // needs a model, and without one the agent can still find problems but
  // cannot propose replacements.
  const { ids } = await configuredProviders();
  set(
    "generate_text",
    ids.length > 0,
    "No AI provider is set up, so the agent can find problems but can't write replacement titles or descriptions. A free Gemini or Groq key is enough.",
  );

  const gaps = [
    ...new Set(
      Object.values(byId)
        .filter((c) => !c.available && c.missing)
        // A capability nothing plans is not a gap in the user's setup —
        // it is a gap in ours, and telling them to update their plugin
        // for it would waste their time and then not work.
        .filter((c) => !(c.id in NOT_YET_PLANNED))
        .map((c) => c.missing as string),
    ),
  ];

  return {
    clientId,
    byId,
    canWrite: WRITE_CAPS.some((id) => byId[id].available),
    gaps,
  };
}

export function has(caps: ClientCapabilities, id: CapabilityId): boolean {
  return caps.byId[id]?.available === true;
}

/**
 * Is the site's bridge plugin at least this version?
 *
 * Plain numeric comparison on dot-separated parts. Returns false when
 * the version is unknown, so a missing or unparseable version is
 * treated as "too old" — the safe direction. Claiming a capability the
 * plugin doesn't have produces a failed write on someone's live site;
 * claiming one it does have produces a message telling them to update,
 * which is merely annoying.
 */
export function hasPluginVersion(
  actual: string | null | undefined,
  required: string,
): boolean {
  if (!actual) return false;
  const parse = (v: string) =>
    v
      .trim()
      .split(".")
      .map((p) => Number.parseInt(p, 10));
  const a = parse(actual);
  const b = parse(required);
  if (a.some(Number.isNaN)) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}
