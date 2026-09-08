"use server";

import { traceMany, type RedirectChain } from "@/lib/redirect-tracer";
import { recordToolRun, type FindingDraft } from "@/lib/tool-findings";
import { clientIdFrom } from "@/lib/client-id-field";

export type BulkState =
  | { ok: true; chains: RedirectChain[] }
  | { ok: false; error: string };

/**
 * What the traces found that is worth doing something about.
 *
 * One finding per URL for the chains, not one for all of them, because
 * each is a different redirect to write and the agent applies them one
 * at a time. The URL is in the signature for the same reason — two
 * chains on two pages are two pieces of work.
 *
 * These DO map to the agent: "redirect_chain" is in TOOL_FINDING_MAP and
 * the executor can now write a redirect, so a chain found here becomes a
 * rule on the site with an undo. That is the loop this tool has been one
 * step short of since it was written.
 */
function chainFindings(chains: RedirectChain[]): FindingDraft[] {
  const out: FindingDraft[] = [];

  for (const c of chains) {
    // A loop is not a chain to shorten — it never resolves at all, so
    // the page is unreachable rather than slow.
    if (c.hadLoop) {
      out.push({
        signature: `redirects-bulk.loop.${c.startUrl}`,
        title: `Redirect loop: ${c.startUrl} never resolves`,
        severity: "critical",
        category: "redirects",
        details:
          "The URL redirects back into a cycle, so browsers give up and nobody reaches the page. " +
          `Traced ${c.hopCount} hops before stopping.`,
      });
      continue;
    }

    if (c.hopCount > 1) {
      out.push({
        signature: `redirects-bulk.chain.${c.startUrl}`,
        title: `${c.hopCount} redirects to reach ${c.finalUrl}`,
        severity: c.hopCount > 2 ? "medium" : "low",
        category: "redirects",
        details:
          `Each hop costs time and loses a little of what the link passes on. Pointing ${c.startUrl} ` +
          `straight at ${c.finalUrl} removes both.`,
      });
    }

    // http somewhere in a chain that ends on https means the first hop
    // is unencrypted, whatever the destination is.
    if (c.hadMixedScheme) {
      out.push({
        signature: `redirects-bulk.mixed_scheme.${c.startUrl}`,
        title: `${c.startUrl} redirects through http before reaching https`,
        severity: "medium",
        category: "redirects",
        details:
          "The first request travels unencrypted, so anything on the network sees the URL " +
          "before the redirect to https happens.",
      });
    }

    if (c.finalStatus >= 400) {
      out.push({
        signature: `redirects-bulk.dead.${c.startUrl}`,
        title: `${c.startUrl} ends at ${c.finalStatus}`,
        severity: c.finalStatus === 404 ? "high" : "medium",
        category: "redirects",
        details: `After ${c.hopCount} hop${c.hopCount === 1 ? "" : "s"} the final URL ${c.finalUrl} returns ${c.finalStatus}.`,
      });
    }
  }

  return out;
}

export async function runBulk(
  _prev: BulkState | null,
  formData: FormData,
): Promise<BulkState> {
  const raw = String(formData.get("urls") ?? "").trim();
  if (!raw) return { ok: false, error: "Paste at least one URL." };

  const urls = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => /^https?:\/\/|^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)),
    ),
  ).slice(0, 100);
  if (urls.length === 0) return { ok: false, error: "No valid URLs found." };

  try {
    const chains = await traceMany(urls);
    const clientId = clientIdFrom(formData);
    await recordToolRun({
      toolId: "redirects-bulk",
      label: `${urls.length} URLs traced`,
      clientId,
      input: { urlCount: urls.length, clientId },
      result: { ok: true, chains },
      findings: chainFindings(chains),
    });
    return { ok: true, chains };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Trace failed" };
  }
}
