import { getSetting, setSetting, deleteSetting } from "@/lib/settings-store";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Google OAuth + GSC + GA4 integration.
 *
 * Strategy: the user creates their own Google Cloud OAuth client (free, no
 * verification needed for self-hosted local-first apps using a localhost
 * redirect), pastes the client ID + secret into our settings, and clicks
 * "Connect Google". We never embed our own OAuth credentials — that would
 * require Google verification + a privacy-policy URL we don't have.
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/business.manage",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
] as const;

export type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  /** True if Client ID + Secret are available (from env or pasted in UI) */
  credentialsSet: boolean;
  /**
   * True when credentials come from env vars — UI hides the paste-your-own
   * flow and shows a single "Sign in with Google" button instead.
   */
  credentialsFromEnv: boolean;
};

export async function getGoogleConnectionStatus(): Promise<GoogleConnectionStatus> {
  const [refreshToken, email] = await Promise.all([
    getSetting<string>("google.refresh_token"),
    getSetting<string>("google.connected_email"),
  ]);
  const creds = await getGoogleClientCredentials();
  const credentialsSet = Boolean(creds);
  const credentialsFromEnv =
    Boolean(creds) &&
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const connected = Boolean(refreshToken);
  return {
    configured: credentialsSet && connected,
    connected,
    credentialsSet,
    credentialsFromEnv,
    email: email ?? null,
  };
}

export async function getGoogleClientCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  // Env vars take priority — this is the "one-click sign-in" path. The
  // developer sets these once at deploy time; every user thereafter just hits
  // Sign in with Google with no Google Cloud Console steps.
  const envId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }

  // Fallback: user-pasted credentials (current self-hosted path).
  const [clientId, clientSecret] = await Promise.all([
    getSetting<string>("google.client_id"),
    getSetting<string>("google.client_secret"),
  ]);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * Build the Google authorization URL. We always force `consent` so the
 * refresh_token is returned (Google only sends it on first-consent or with
 * `prompt=consent`).
 */
export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  if (opts.state) params.set("state", opts.state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
};

export async function exchangeCodeForTokens(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${body}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${body}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

/**
 * Returns a usable access_token, refreshing it transparently if expired.
 * Throws if the integration isn't connected.
 *
 * If `clientId` (numeric) is provided AND that client has its OWN Google
 * tokens stored, prefers those. Otherwise falls back to the workspace-wide
 * tokens. This lets agencies connect each client's own Google account when
 * the client won't share access with the agency-level Google identity.
 */
export async function getAccessToken(
  clientIdScope?: number,
): Promise<string> {
  // Per-client tokens take priority if a clientId scope is provided
  if (clientIdScope && Number.isFinite(clientIdScope)) {
    const [c] = await db
      .select({
        googleRefreshToken: clients.googleRefreshToken,
        googleAccessToken: clients.googleAccessToken,
        googleAccessTokenExpiresAt: clients.googleAccessTokenExpiresAt,
      })
      .from(clients)
      .where(eq(clients.id, clientIdScope))
      .limit(1);

    if (c?.googleRefreshToken) {
      const refreshTokenPlain = decrypt(c.googleRefreshToken);
      const accessTokenPlain = c.googleAccessToken
        ? decrypt(c.googleAccessToken)
        : null;
      const expiresAt = c.googleAccessTokenExpiresAt ?? 0;
      if (accessTokenPlain && expiresAt - 60_000 > Date.now()) {
        return accessTokenPlain;
      }
      // Refresh per-client token using workspace OAuth client credentials
      const wsClientId = await getSetting<string>("google.client_id");
      const wsClientSecret = await getSetting<string>("google.client_secret");
      if (!wsClientId || !wsClientSecret) {
        throw new Error(
          "Workspace OAuth client not configured — set Google client_id / client_secret first.",
        );
      }
      const refreshed = await refreshAccessToken({
        refreshToken: refreshTokenPlain,
        clientId: wsClientId,
        clientSecret: wsClientSecret,
      });
      const newExpiresAt = Date.now() + refreshed.expires_in * 1000;
      await db
        .update(clients)
        .set({
          googleAccessToken: encrypt(refreshed.access_token),
          googleAccessTokenExpiresAt: newExpiresAt,
        })
        .where(eq(clients.id, clientIdScope));
      return refreshed.access_token;
    }
    // Fall through to workspace tokens
  }

  const [clientId, clientSecret, refreshTokenRaw, accessTokenRaw, expiresAtRaw] =
    await Promise.all([
      getSetting<string>("google.client_id"),
      getSetting<string>("google.client_secret"),
      getSetting<string>("google.refresh_token"),
      getSetting<string>("google.access_token"),
      getSetting<number>("google.access_token_expires_at"),
    ]);

  // Decrypt at-rest values (no-op for legacy plaintext rows)
  const refreshToken = refreshTokenRaw ? decrypt(refreshTokenRaw) : null;
  const accessToken = accessTokenRaw ? decrypt(accessTokenRaw) : null;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google not connected — connect it in Settings → Google.");
  }

  const expiresAt = expiresAtRaw ?? 0;
  // Refresh 60s before actual expiry to avoid edge-case races.
  if (accessToken && expiresAt - 60_000 > Date.now()) {
    return accessToken;
  }

  const refreshed = await refreshAccessToken({
    refreshToken,
    clientId,
    clientSecret,
  });
  await Promise.all([
    setSetting("google.access_token", encrypt(refreshed.access_token)),
    setSetting(
      "google.access_token_expires_at",
      Date.now() + refreshed.expires_in * 1000,
    ),
  ]);
  return refreshed.access_token;
}

export async function fetchGoogleUserEmail(
  accessToken: string,
): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export async function disconnectGoogle(): Promise<void> {
  await Promise.all([
    deleteSetting("google.refresh_token"),
    deleteSetting("google.access_token"),
    deleteSetting("google.access_token_expires_at"),
    deleteSetting("google.connected_email"),
  ]);
}

// =====================
// GSC (Search Console)
// =====================

export type GscProperty = {
  siteUrl: string;
  permissionLevel: string;
};

export async function listGscProperties(): Promise<GscProperty[]> {
  const token = await getAccessToken();
  const res = await fetch(
    "https://searchconsole.googleapis.com/webmasters/v3/sites",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`GSC list failed: ${res.status}`);
  const data = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  };
  return (data.siteEntry ?? []).filter(
    (s) => s.permissionLevel !== "siteUnverifiedUser",
  );
}

export type GscQueryRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function fetchGscPerformance(opts: {
  siteUrl: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  dimensions?: ("query" | "page" | "country" | "device" | "date")[];
  rowLimit?: number;
  /** If set, prefer per-client OAuth tokens for this scoped client. */
  clientIdScope?: number;
}): Promise<GscQueryRow[]> {
  const token = await getAccessToken(opts.clientIdScope);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      opts.siteUrl,
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions ?? ["query"],
        rowLimit: opts.rowLimit ?? 1000,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC query failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { rows?: GscQueryRow[] };
  return data.rows ?? [];
}

// =====================
// GSC URL Inspection
// =====================

export type UrlInspection = {
  url: string;
  /** "INDEXING_STATE_UNSPECIFIED" | "INDEXING_ALLOWED" | "BLOCKED_BY_META_TAG" | "BLOCKED_BY_HTTP_HEADER" | "BLOCKED_BY_ROBOTS_TXT" */
  indexingState: string | null;
  /** "VERDICT_UNSPECIFIED" | "PASS" | "PARTIAL" | "FAIL" | "NEUTRAL" */
  verdict: string | null;
  /** "DESKTOP" | "MOBILE" — which user-agent crawled it last */
  crawledAs: string | null;
  lastCrawlTime: string | null;
  pageFetchState: string | null;
  robotsTxtState: string | null;
  /** Whether the URL is in Google's index right now. */
  coverageState: string | null;
  /** Reason for non-indexing if any. */
  coverageStateReason: string | null;
  referringUrls: string[];
  sitemap: string[];
  error?: string;
};

export async function inspectGscUrl(opts: {
  siteUrl: string;
  inspectionUrl: string;
  clientIdScope?: number;
}): Promise<UrlInspection> {
  try {
    const token = await getAccessToken(opts.clientIdScope);
    const res = await fetch(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          inspectionUrl: opts.inspectionUrl,
          siteUrl: opts.siteUrl,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      return emptyInspection(opts.inspectionUrl, `${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      inspectionResult?: {
        verdict?: string;
        indexStatusResult?: {
          verdict?: string;
          coverageState?: string;
          robotsTxtState?: string;
          pageFetchState?: string;
          indexingState?: string;
          lastCrawlTime?: string;
          crawledAs?: string;
          coverageState_reason?: string;
          sitemap?: string[];
          referringUrls?: string[];
        };
      };
    };
    const r = data.inspectionResult?.indexStatusResult ?? {};
    return {
      url: opts.inspectionUrl,
      indexingState: r.indexingState ?? null,
      verdict: data.inspectionResult?.verdict ?? r.verdict ?? null,
      crawledAs: r.crawledAs ?? null,
      lastCrawlTime: r.lastCrawlTime ?? null,
      pageFetchState: r.pageFetchState ?? null,
      robotsTxtState: r.robotsTxtState ?? null,
      coverageState: r.coverageState ?? null,
      coverageStateReason: r.coverageState_reason ?? null,
      referringUrls: r.referringUrls ?? [],
      sitemap: r.sitemap ?? [],
    };
  } catch (err) {
    return emptyInspection(opts.inspectionUrl, (err as Error).message);
  }
}

function emptyInspection(url: string, error: string): UrlInspection {
  return {
    url,
    indexingState: null,
    verdict: null,
    crawledAs: null,
    lastCrawlTime: null,
    pageFetchState: null,
    robotsTxtState: null,
    coverageState: null,
    coverageStateReason: null,
    referringUrls: [],
    sitemap: [],
    error,
  };
}

// =====================
// GA4 (Analytics Data API)
// =====================

export type Ga4Property = {
  /** "properties/123456789" — the API resource name */
  name: string;
  /** Numeric ID — what we store on the client record */
  id: string;
  displayName: string;
  /** Friendly account label, e.g. "Acme Inc" */
  accountName: string;
};

/**
 * GA4 doesn't expose a direct "list properties for me" endpoint as part of
 * the Data API. We use the Admin API, which the user's OAuth scope covers.
 */
export async function listGa4Properties(): Promise<Ga4Property[]> {
  const token = await getAccessToken();

  // 1. List accounts the user can see
  const accountsRes = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!accountsRes.ok) {
    throw new Error(`GA4 list accounts failed: ${accountsRes.status}`);
  }
  const data = (await accountsRes.json()) as {
    accountSummaries?: Array<{
      account: string;
      displayName: string;
      propertySummaries?: Array<{
        property: string; // "properties/123"
        displayName: string;
      }>;
    }>;
  };

  const result: Ga4Property[] = [];
  for (const acc of data.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      const id = p.property.replace(/^properties\//, "");
      result.push({
        name: p.property,
        id,
        displayName: p.displayName,
        accountName: acc.displayName,
      });
    }
  }
  return result;
}

/**
 * Per-landing-page organic conversions + revenue. Same dimensions as
 * the page-level GSC report — joining the two by URL gives us "clicks
 * vs conversions" per landing page.
 */
export async function fetchGa4OrganicByLandingPage(opts: {
  propertyId: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
  clientIdScope?: number;
}): Promise<
  {
    landingPage: string;
    sessions: number;
    conversions: number;
    revenue: number;
  }[]
> {
  const token = await getAccessToken(opts.clientIdScope);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${opts.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [
          { name: "sessions" },
          { name: "conversions" },
          { name: "totalRevenue" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
        limit: String(opts.rowLimit ?? 250),
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 landing-page report failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues: { value: string }[];
      metricValues: { value: string }[];
    }>;
  };
  return (data.rows ?? []).map((r) => ({
    landingPage: r.dimensionValues[0]?.value ?? "",
    sessions: Number(r.metricValues[0]?.value ?? 0),
    conversions: Number(r.metricValues[1]?.value ?? 0),
    revenue: Number(r.metricValues[2]?.value ?? 0),
  }));
}

/**
 * Pull total GA4 conversions + revenue attributed to organic search over
 * a date range. Returns zeros if the GA4 property exists but has no
 * conversion events configured. Throws if GA4 isn't connected.
 */
export async function fetchGa4OrganicConversions(opts: {
  propertyId: string;
  startDate: string;
  endDate: string;
  clientIdScope?: number;
}): Promise<{ conversions: number; revenue: number }> {
  const token = await getAccessToken(opts.clientIdScope);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${opts.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        metrics: [
          { name: "conversions" },
          { name: "totalRevenue" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 conversions report failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{ metricValues: { value: string }[] }>;
  };
  const row = data.rows?.[0];
  return {
    conversions: Number(row?.metricValues[0]?.value ?? 0),
    revenue: Number(row?.metricValues[1]?.value ?? 0),
  };
}

export type Ga4OverviewRow = {
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
};

/**
 * Daily organic-search overview. Expand this as we wire up dashboards;
 * keeping it minimal so it compiles before we touch the dashboard layer.
 */
export async function fetchGa4OrganicOverview(opts: {
  propertyId: string;
  startDate: string;
  endDate: string;
  /** If set, prefer per-client OAuth tokens. */
  clientIdScope?: number;
}): Promise<Ga4OverviewRow[]> {
  const token = await getAccessToken(opts.clientIdScope);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${opts.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
        ],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { matchType: "EXACT", value: "Organic Search" },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 report failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    rows?: Array<{
      dimensionValues: { value: string }[];
      metricValues: { value: string }[];
    }>;
  };
  return (data.rows ?? []).map((r) => ({
    date: r.dimensionValues[0]?.value ?? "",
    sessions: Number(r.metricValues[0]?.value ?? 0),
    users: Number(r.metricValues[1]?.value ?? 0),
    pageviews: Number(r.metricValues[2]?.value ?? 0),
  }));
}
