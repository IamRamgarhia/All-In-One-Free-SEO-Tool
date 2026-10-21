import type { HttpResponse } from "@/audit/types";

export async function fetchPage(
  url: string,
  timeoutMs: number,
): Promise<{ response: HttpResponse; html: string }> {
  const started = Date.now();
  const redirectChain: string[] = [];
  let current = url;
  let status = 0;
  let headers: Record<string, string> = {};
  let html = "";
  let finalUrl = url;

  // Manual redirect follow so we record the chain (max 8 hops).
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "SeoToolAuditBot/1.0 (+https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    status = res.status;
    headers = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    if (status >= 300 && status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      redirectChain.push(current);
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
    timingMs: Date.now() - started,
  };
  return { response, html };
}
