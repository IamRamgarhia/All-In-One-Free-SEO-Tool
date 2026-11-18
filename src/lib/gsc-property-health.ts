/**
 * Does each client's saved Search Console property still exist in the
 * Google account that is connected?
 *
 * Found by regression-testing the MCP surface on 19 Nov 2026. Four tools
 * — inspect_url, check_indexing, compare_search_periods, list_sitemaps —
 * returned:
 *
 *   403 "User does not have sufficient permission for site
 *        'https://dicecodes.com/'"
 *
 * A 403 and not a 401, so the OAuth token was fine. Asking Google what
 * the account could actually see returned ZERO properties, while the
 * client row still held `gsc_property = "https://dicecodes.com/"` from
 * an earlier connection.
 *
 * Nothing in the app noticed. listGscProperties() is called when you
 * PICK a property and never again, so a property that stops being
 * readable — the account was changed, access was removed, the site was
 * re-verified as a domain property — keeps being sent to Google forever.
 * Every Search Console feature then fails one call at a time, deep
 * inside whichever tool the user happened to open, with a raw Google
 * error. Search Console is the app's single most important free data
 * source; silently losing it is the most expensive kind of quiet
 * breakage this product can have.
 *
 * Pure so it can be tested without a Google account.
 */

export type GscClient = {
  id: number;
  name: string;
  gscProperty: string | null;
};

export type GscAvailableProperty = {
  siteUrl: string;
  permissionLevel: string;
};

export type GscPropertyIssue = {
  clientId: number;
  clientName: string;
  /** What the client sends to Google today. */
  stored: string;
  /** The property in the account that looks like the one meant, if any. */
  suggestion: string | null;
  reason: "account-has-none" | "not-in-account";
};

export type GscPropertyHealth = {
  /** Clients with a property set that the account cannot read. */
  issues: GscPropertyIssue[];
  /** Clients whose property matches one the account holds. */
  okCount: number;
  /** Clients with no property set — not a fault, just not connected. */
  unsetCount: number;
};

/**
 * Compare a property string to a host, ignoring the differences Google
 * treats as the same site in conversation but not in the API:
 * `sc-domain:` prefixes, scheme, `www.`, and the trailing slash.
 */
function hostOf(property: string): string {
  const withoutPrefix = property.startsWith("sc-domain:")
    ? property.slice("sc-domain:".length)
    : property;
  let host = withoutPrefix;
  try {
    host = new URL(withoutPrefix).hostname;
  } catch {
    host = withoutPrefix.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
  return host.replace(/^www\./, "").toLowerCase();
}

export function diagnoseGscProperties(
  clients: readonly GscClient[],
  available: readonly GscAvailableProperty[],
): GscPropertyHealth {
  const held = new Set(available.map((p) => p.siteUrl));
  const issues: GscPropertyIssue[] = [];
  let okCount = 0;
  let unsetCount = 0;

  for (const client of clients) {
    const stored = client.gscProperty?.trim();
    if (!stored) {
      unsetCount++;
      continue;
    }
    if (held.has(stored)) {
      okCount++;
      continue;
    }
    // Same site, different spelling of it — by far the likeliest cause
    // once an account has any properties at all, because Google has
    // recommended domain properties since 2019 and the URL-prefix form
    // is what older set-up flows stored.
    const wanted = hostOf(stored);
    const suggestion =
      available.find((p) => hostOf(p.siteUrl) === wanted)?.siteUrl ?? null;
    issues.push({
      clientId: client.id,
      clientName: client.name,
      stored,
      suggestion,
      reason: available.length === 0 ? "account-has-none" : "not-in-account",
    });
  }

  return { issues, okCount, unsetCount };
}

/** One line a person can act on, for each kind of breakage. */
export function describeGscIssue(issue: GscPropertyIssue): string {
  if (issue.suggestion) {
    return (
      `${issue.clientName} asks Google for "${issue.stored}", which this ` +
      `account cannot read. It holds "${issue.suggestion}" for the same ` +
      `site — switch to it in the client's Google settings.`
    );
  }
  if (issue.reason === "account-has-none") {
    return (
      `${issue.clientName} asks Google for "${issue.stored}", but the ` +
      `connected Google account has no Search Console properties at all. ` +
      `Either the wrong account is connected, or the site was never ` +
      `verified. Every Search Console feature returns 403 until this is fixed.`
    );
  }
  return (
    `${issue.clientName} asks Google for "${issue.stored}", which is not ` +
    `in the connected account. Reconnect Google, or pick a property that is.`
  );
}
