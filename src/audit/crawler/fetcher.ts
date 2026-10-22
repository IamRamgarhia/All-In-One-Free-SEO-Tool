import type { HttpResponse, RedirectHop } from "@/audit/types";
import { REPO_UA_SUFFIX } from "@/lib/repo";
import { guardUrl, SsrfBlockedError } from "@/lib/url-guard";

export async function fetchPage(
  url: string,
  timeoutMs: number,
  opts: { allowPrivate?: boolean } = {},
): Promise<{ response: HttpResponse; html: string }> {
  const started = Date.now();
  const redirectChain: RedirectHop[] = [];
  let current = url;
  let status = 0;
  let headers: Record<string, string> = {};
  let setCookie: string[] = [];
  let html = "";
  let finalUrl = url;

  // Manual redirect follow so we record the chain with status codes (max 8 hops).
  for (let hop = 0; hop < 8; hop++) {
    const guarded = await guardUrl(current, {
      allowPrivate: opts.allowPrivate ?? true,
    });
    if (!guarded.ok) throw new SsrfBlockedError(guarded.reason);

    const res = await fetch(guarded.url.href, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": `SeoToolAuditBot/1.0 (${REPO_UA_SUFFIX})`,
        accept: "text/html,application/xhtml+xml",
      },
    });
    status = res.status;
    headers = {};
    setCookie = [];
    res.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === "set-cookie") {
        setCookie.push(v);
        return;
      }
      headers[key] = v;
    });
    // Node/undici exposes getSetCookie when available.
    const getSetCookie = (
      res.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie;
    if (typeof getSetCookie === "function") {
      const cookies = getSetCookie.call(res.headers);
      if (cookies.length > 0) setCookie = cookies;
    }

    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      redirectChain.push({ url: current, statusCode: status });
      current = new URL(loc, current).href;
      continue;
    }

    finalUrl = current;
    html = await res.text();
    break;
  }

  const response: HttpResponse = {
    url,
    finalUrl,
    status,
    headers,
    redirected: redirectChain.length > 0,
    redirectChain,
    setCookie: setCookie.length > 0 ? setCookie : undefined,
    timingMs: Date.now() - started,
  };
  return { response, html };
}
