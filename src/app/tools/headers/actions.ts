"use server";

import { saveSnapshot } from "@/lib/snapshots";
import { recordToolRun, type FindingDraft } from "@/lib/tool-findings";
import { guardUrl } from "@/lib/url-guard";

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
      // Guard each hop, then fetch it manually. Not guardedFetch: this
      // tool exists to REPORT the chain, so it has to see every 3xx and
      // its Location itself, and guardedFetch collapses the chain into
      // the final response.
      //
      // Per hop rather than once at the start, because a public URL that
      // redirects to 169.254.169.254 is the standard way past a check
      // that only looks at what the user typed.
      const verdict = await guardUrl(current);
      if (!verdict.ok) {
        clearTimeout(t);
        // Ending the trace with a reason, rather than returning a chain
        // that stops short and reads as complete. "This redirects
        // somewhere we will not follow" is the finding.
        return {
          ok: false,
          error:
            chain.length === 0
              ? `Can't check that address: ${verdict.reason}`
              : `Stopped after ${chain.length} hop${chain.length === 1 ? "" : "s"}: ${current} ${verdict.reason.toLowerCase()}. A public URL that redirects into a private address is a known way to make a server fetch something it shouldn't, so this tool won't follow it.`,
        };
      }
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
        const result: HeadersResult = {
          ok: true,
          chain,
          finalUrl: current,
          totalHops: chain.length,
        };
        await recordToolRun({
          toolId: "headers",
          label: `${url} · ${chain.length} hops · ${chain[chain.length - 1]?.status ?? "?"}`,
          input: { url },
          result,
          findings: chainFindings(chain, current),
        });
        return result;
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

/**
 * What the redirect trace is worth telling somebody about.
 *
 * `headers.redirect_chain` is mapped onto the crawler's own
 * redirect_chain in TOOL_FINDING_MAP, which means the agent can act on
 * it: it now knows how to write a redirect, so a chain found here can
 * become a rule that points the first hop straight at the destination.
 *
 * One finding per run rather than per hop. The chain is one problem with
 * one fix, and listing every hop would turn a single edit into four
 * things to close.
 */
function chainFindings(
  chain: HeaderHop[],
  finalUrl: string,
): FindingDraft[] {
  const out: FindingDraft[] = [];
  const last = chain[chain.length - 1];

  if (chain.length > 1) {
    out.push({
      signature: "headers.redirect_chain",
      title: `${chain.length} redirects before the page loads`,
      // Two hops is untidy; more than two starts costing crawl budget
      // and enough milliseconds for a person to notice.
      severity: chain.length > 2 ? "medium" : "low",
      category: "redirects",
      details:
        `${chain.map((h) => `${h.status}`).join(" → ")} before reaching ${finalUrl}. ` +
        "Each hop costs time and loses a little of what the link passes on.",
    });
  }

  if (last && last.status >= 400) {
    out.push({
      signature: "headers.dead_end",
      title: `The URL ends at ${last.status}`,
      severity: last.status === 404 ? "high" : "medium",
      category: "redirects",
      details:
        `After ${chain.length} hop${chain.length === 1 ? "" : "s"} the final URL ` +
        `${finalUrl} returns ${last.status}, so anyone following this link arrives nowhere.`,
    });
  }

  return out;
}
