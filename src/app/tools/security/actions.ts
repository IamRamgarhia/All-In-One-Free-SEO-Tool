"use server";

export type SecurityResult =
  | {
      ok: true;
      hostname: string;
      observatory: ObservatoryResult | null;
      ssl: SslResult | null;
      headers: HttpHeader[];
    }
  | { ok: false; error: string };

export type ObservatoryResult = {
  grade: string | null;
  score: number | null;
  testsPassed: number;
  testsFailed: number;
  scanId: number | null;
};

export type SslResult = {
  grade: string | null;
  protocol: string | null;
  validFrom: string | null;
  validTo: string | null;
  issuer: string | null;
};

export type HttpHeader = {
  name: string;
  value: string;
  good: boolean;
  hint?: string;
};

const HEADER_CHECKS: Array<{
  name: string;
  hint: string;
  expected?: RegExp;
}> = [
  {
    name: "strict-transport-security",
    hint: "Forces HTTPS for future visits. Should include max-age and includeSubDomains.",
    expected: /max-age=\d+/i,
  },
  {
    name: "content-security-policy",
    hint: "Prevents XSS by allow-listing script sources.",
  },
  {
    name: "x-content-type-options",
    hint: "Should be 'nosniff'.",
    expected: /nosniff/i,
  },
  {
    name: "x-frame-options",
    hint: "Prevents clickjacking. SAMEORIGIN or DENY.",
    expected: /sameorigin|deny/i,
  },
  {
    name: "referrer-policy",
    hint: "Controls how much of the URL is sent on link-clicks.",
  },
  {
    name: "permissions-policy",
    hint: "Restricts browser feature access (camera, mic, etc).",
  },
];

function hostnameOf(rawUrl: string): string | null {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function checkObservatory(host: string): Promise<ObservatoryResult | null> {
  // Mozilla Observatory v2 API (free, no key)
  // https://observatory.mozilla.org/api/v2/scan?host=example.com
  type ObsResp = {
    id?: number;
    grade?: string;
    score?: number;
    tests_passed?: number;
    tests_failed?: number;
  };
  const data = await fetchJson<ObsResp>(
    `https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${encodeURIComponent(host)}`,
  );
  if (!data) return null;
  return {
    grade: data.grade ?? null,
    score: data.score ?? null,
    testsPassed: data.tests_passed ?? 0,
    testsFailed: data.tests_failed ?? 0,
    scanId: data.id ?? null,
  };
}

async function checkSsl(host: string): Promise<SslResult | null> {
  // SSL Labs analyze API (free, no key, but slow first call)
  // We do a single non-startNew call to check cached result; if not cached,
  // we kick off + return what we have.
  type SslLabsResp = {
    status?: string;
    endpoints?: {
      grade?: string;
      details?: {
        protocols?: { name: string; version: string }[];
        cert?: {
          notBefore?: number;
          notAfter?: number;
          subject?: string;
          issuerSubject?: string;
        };
      };
    }[];
  };
  const data = await fetchJson<SslLabsResp>(
    `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(host)}&fromCache=on&maxAge=24`,
  );
  if (!data) return null;
  const ep = data.endpoints?.[0];
  if (!ep) return null;
  const cert = ep.details?.cert;
  return {
    grade: ep.grade ?? null,
    protocol: ep.details?.protocols?.[0]
      ? `${ep.details.protocols[0].name} ${ep.details.protocols[0].version}`
      : null,
    validFrom: cert?.notBefore
      ? new Date(cert.notBefore).toISOString().slice(0, 10)
      : null,
    validTo: cert?.notAfter
      ? new Date(cert.notAfter).toISOString().slice(0, 10)
      : null,
    issuer: cert?.issuerSubject ?? null,
  };
}

async function checkHeaders(rawUrl: string): Promise<HttpHeader[]> {
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
      },
      signal: AbortSignal.timeout(10_000),
    });
    return HEADER_CHECKS.map((c) => {
      const value = res.headers.get(c.name) ?? "";
      const good = value
        ? c.expected
          ? c.expected.test(value)
          : true
        : false;
      return { name: c.name, value, good, hint: c.hint };
    });
  } catch {
    return HEADER_CHECKS.map((c) => ({
      name: c.name,
      value: "",
      good: false,
      hint: c.hint,
    }));
  }
}

export async function checkSecurity(
  rawUrl: string,
): Promise<SecurityResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL is required" };
  const host = hostnameOf(rawUrl);
  if (!host) return { ok: false, error: "Invalid URL" };

  const [observatory, ssl, headers] = await Promise.all([
    checkObservatory(host).catch(() => null),
    checkSsl(host).catch(() => null),
    checkHeaders(rawUrl),
  ]);

  return { ok: true, hostname: host, observatory, ssl, headers };
}
