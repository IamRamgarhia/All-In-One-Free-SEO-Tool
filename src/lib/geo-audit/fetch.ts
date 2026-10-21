import { guardedFetch } from "@/lib/url-guard";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BYTES = 5_000_000;
export const GEO_USER_AGENT = "SeomatorGeoAudit/1.2.1 (+https://github.com/seomator/geo-audit-skill)";

export type FetchHop = { url: string; status: number };

export type FetchResult = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  chain: FetchHop[];
  ok: boolean;
};

function lowerHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function readBodyLimited(
  res: Response,
  maxBytes: number,
  outerSignal?: AbortSignal,
): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (outerSignal?.aborted) throw outerSignal.reason ?? new Error("Aborted");
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Response body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buf = Buffer.concat(chunks);
  return buf.toString("utf8");
}

export async function geoFetch(
  url: string,
  opts: {
    timeoutMs?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    accept?: string;
  } = {},
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const chain: FetchHop[] = [];
  let current = url;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const signal = controller.signal;

  let res: Response;
  try {
    res = await guardedFetch(current, {
      signal,
      maxRedirects: 5,
      headers: {
        "user-agent": GEO_USER_AGENT,
        accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  chain.push({ url: current, status: res.status });
  const body = await readBodyLimited(res, maxBytes, signal);
  const headers = lowerHeaders(res);
  const ok = res.status >= 200 && res.status < 300;

  return {
    requestedUrl: url,
    finalUrl: res.url || current,
    status: res.status,
    headers,
    body,
    chain,
    ok,
  };
}
