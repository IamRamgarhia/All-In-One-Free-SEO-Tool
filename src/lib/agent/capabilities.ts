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
];

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

  // Alt text is the exception, and saying so is the point.
  //
  // `setAttachmentAlt` takes a WordPress attachment id. An audit finding
  // gives us a page URL and the image's src — the bridge has no endpoint
  // that maps one to the other, so there is no way to reach the right
  // attachment. Until the plugin exposes "list the images on this post
  // with their attachment ids", this cannot be done.
  //
  // Reporting it as available (which it was, because every WP write
  // shared one flag) meant the planner planned alt-text work on every
  // WordPress client and the executor failed all of it. Capability
  // detection exists to prevent exactly that, and a blanket flag
  // defeated it.
  //
  // Plugin 0.3.0 added `GET /post/{id}/images`, which finally supplies
  // the attachment ids. What's still missing is on our side: the
  // executor writes ONE value to ONE post, and alt text is N images per
  // page. That needs a per-image action model, and half-wiring it would
  // recreate the plan-without-execute mismatch this flag exists to
  // prevent — the contract test in contract.test.ts would fail, by
  // design.
  // Plugin 0.3.0 added `GET /post/{id}/images`, and `expandImageActions`
  // in run.ts turns one page finding into one action per image. Both
  // halves now exist, so this is available — but only against a plugin
  // new enough to have the endpoint.
  set(
    "write_image_alt",
    wpOk && hasPluginVersion(wpVersion, "0.3.0"),
    wpOk
      ? `This site's SEO Tool Bridge plugin is ${wpVersion ?? "an unknown version"}. Alt text needs 0.3.0 or newer, which added the endpoint that maps an image on a page to its media-library entry. Update the plugin.`
      : wpError,
  );

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
