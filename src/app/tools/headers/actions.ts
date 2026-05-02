"use server";

import { saveSnapshot } from "@/lib/snapshots";

export type HeaderHop = {
  url: string;
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  redirectedTo?: string;
};

export type HeadersResult =
  | { ok: true; chain: HeaderHop[]; finalUrl: string; totalHops: number }
  | { ok: false; error: string };

const MAX_HOPS = 12;

export async function inspectHeaders(
  rawUrl: string,
): Promise<HeadersResult> {
  if (!rawUrl?.trim()) return { ok: false, error: "URL required" };
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  const chain: HeaderHop[] = [];
  let current = url;

  for (let i = 0; i < MAX_HOPS; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 12_000);
    try {
      const res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: c.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        },
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const isRedirect = res.status >= 300 && res.status < 400;
      const location = isRedirect ? res.headers.get("location") : null;
      const next = location
        ? new URL(location, current).toString()
        : undefined;
      chain.push({
        url: current,
        status: res.status,
        finalUrl: current,
        headers,
        redirectedTo: next,
      });
      if (!next) {
        return {
          ok: true,
          chain,
          finalUrl: current,
          totalHops: chain.length,
        };
      }
      current = next;
    } catch (err) {
      chain.push({
        url: current,
        status: 0,
        finalUrl: current,
        headers: {},
      });
      return {
        ok: false,
        error: `Hop ${chain.length} failed: ${(err as Error).message}`,
      };
    } finally {
      clearTimeout(t);
    }
  }

  return { ok: false, error: `Too many redirects (>${MAX_HOPS})` };
}

export async function saveHeadersSnapshot(opts: {
  url: string;
  data: HeadersResult;
  clientId?: number | null;
  note?: string;
}): Promise<{ ok: true; id: number }> {
  const totalHops =
    opts.data.ok && opts.data.chain ? opts.data.chain.length : 0;
  return saveSnapshot({
    clientId: opts.clientId ?? null,
    kind: "headers",
    label: opts.url,
    note: opts.note,
    data: opts.data,
    primaryMetric: totalHops,
    primaryMetricLabel: "hops",
  });
}
