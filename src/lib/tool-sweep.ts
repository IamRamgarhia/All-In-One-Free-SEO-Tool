/**
 * Running the checks nobody remembers to open.
 *
 * 91 tools, and the only way any of them ever ran was a person clicking
 * into it. That is the actual gap between this and "an SEO's work done
 * by AI": not that the checks do not exist, but that they only happen
 * when someone thinks to make them happen. A weekly check nobody
 * performs is not a feature.
 *
 * This runs the ones that can run unattended and records what they find.
 * The bar for inclusion is deliberately narrow, and each criterion has
 * cost the project something before:
 *
 *   Free — no API key, no per-call charge. A scheduled job that quietly
 *   spends money is the worst possible surprise in a self-hosted tool.
 *
 *   Deterministic — same site, same answer. Anything that asks a model
 *   would produce a different set of findings every week, and every one
 *   of them would look new.
 *
 *   Cheap — a handful of HTTP requests. This runs for every client, so
 *   a tool that crawls 200 pages belongs behind a button, not here.
 *
 * Tools that fail the bar keep working exactly as they do now. Nothing
 * is removed; things stop being things you have to remember.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { withClientContext } from "./client-context";

/**
 * One sweepable check.
 *
 * `run` is dynamically imported so the scheduler does not pull every
 * tool's dependency graph into the process at boot.
 */
type SweepCheck = {
  toolId: string;
  label: string;
  /**
   * What this client must have before the check is worth running.
   *
   * A GSC-backed check on a client with no property connected is not a
   * failure — there is simply nothing to read. Running it anyway would
   * fill the sweep log with errors that are really just "not set up
   * yet", and an error log full of expected errors is one nobody reads.
   */
  requires?: (client: SweepClient) => boolean;
  /**
   * How often this is worth paying for.
   *
   * "daily" is the bar the header describes: a handful of requests.
   * "weekly" is for checks that have to crawl to answer at all —
   * canonical chains across a site, soft 404s, orphan pages. Those
   * genuinely cannot be cheap, and the alternative to running them
   * weekly was a button nobody pressed, which is not a cheaper answer,
   * it is no answer.
   *
   * Nothing runs both tiers, and the weekly tier is a separate scheduler
   * job so a slow crawl cannot delay the nightly checks.
   */
  cadence?: "daily" | "weekly";
  run: (client: SweepClient) => Promise<unknown>;
};

type SweepClient = { id: number; url: string; gscProperty: string | null };

function checks(): SweepCheck[] {
  return [
    {
      toolId: "robots",
      label: "robots.txt and sitemap health",
      run: async (c) =>
        (await import("@/app/tools/robots/actions")).checkRobots(c.url, c.id),
    },
    {
      toolId: "ai-robots",
      label: "AI crawler policy",
      run: async (c) =>
        (await import("@/app/tools/ai-robots/actions")).runAiRobotsAudit(
          c.url,
          c.id,
        ),
    },
    {
      toolId: "headers",
      label: "Redirect chain and response headers",
      run: async (c) =>
        (await import("@/app/tools/headers/actions")).inspectHeaders(c.url),
    },
    {
      toolId: "hreflang",
      label: "Hreflang reciprocity",
      run: async (c) =>
        (await import("@/app/tools/hreflang/actions")).checkHreflang(c.url),
    },
    {
      toolId: "llms-txt",
      label: "llms.txt validity",
      run: async (c) =>
        (await import("@/app/tools/llms-txt/actions")).validateLlmsTxt(c.url),
    },
    {
      toolId: "freshness",
      label: "Content freshness signals",
      run: async (c) =>
        (await import("@/app/tools/freshness/actions")).runFreshnessAudit(c.url),
    },
    {
      toolId: "mobile-friendly",
      label: "Viewport and mobile basics",
      run: async (c) => {
        // A form action, so it wants FormData. Built here rather than
        // reaching past it into the library, because the point of a
        // sweep is to run the same code path a person would.
        const form = new FormData();
        form.set("url", c.url);
        return (await import("@/app/tools/mobile-friendly/actions")).runMobile(
          null,
          form,
        );
      },
    },
    {
      toolId: "schema-validate",
      label: "Structured data validity",
      run: async (c) => {
        const form = new FormData();
        form.set("url", c.url);
        return (
          await import("@/app/tools/schema-validate/actions")
        ).runValidate(null, form);
      },
    },
    {
      toolId: "wp-hack-scan",
      label: "WordPress compromise indicators",
      // Cheap, deterministic, and the one check here whose finding is
      // urgent rather than merely useful. A site serving injected spam
      // loses its rankings in days, and nobody opens a malware scanner
      // on a normal Tuesday.
      run: async (c) => {
        const form = new FormData();
        form.set("url", c.url);
        return (await import("@/app/tools/wp-hack-scan/actions")).runWpHackScan(
          null,
          form,
        );
      },
    },
    {
      toolId: "cannibalization",
      label: "Pages competing for the same query",
      // Search Console data, so free and deterministic — but only where
      // a property is connected.
      requires: (c) => Boolean(c.gscProperty),
      run: async (c) => {
        const form = new FormData();
        form.set("site", c.gscProperty ?? "");
        return (
          await import("@/app/tools/cannibalization/actions")
        ).runCannibalScan(null, form);
      },
    },
    {
      toolId: "traffic-drop",
      label: "Month-over-month organic clicks",
      // "GSC sudden drops → auto-alert" is the first line of the morning
      // health check this tool exists to do for people, and it was the
      // one thing on that list still waiting for somebody to open a
      // page. A drop found three weeks late is a report, not an alert.
      //
      // The property, not the client's URL: this string goes straight to
      // Search Console, which knows "sc-domain:example.com" and not
      // "https://example.com/". Passing the wrong one returns no rows,
      // which reads as "no drop" — a confidently reassuring answer built
      // on nothing.
      requires: (c) => Boolean(c.gscProperty),
      run: async (c) => {
        const form = new FormData();
        form.set("siteUrl", c.gscProperty ?? "");
        return (await import("@/app/tools/traffic-drop/actions")).runDiagnostic(
          null,
          form,
        );
      },
    },
    {
      toolId: "canonical-audit",
      label: "Canonical tags across the site",
      // Weekly, because it crawls. A canonical chain is invisible from
      // any single page — you only see it by following one page's
      // canonical to another page and reading that one's. No per-page
      // check can find it, which is why this was a button nobody pressed.
      cadence: "weekly",
      run: async (c) => {
        const form = new FormData();
        form.set("startUrl", c.url);
        // Well under the tool's own 80 default. This runs unattended for
        // every client, and the shape of a site's canonical problems is
        // visible in the first few dozen pages.
        form.set("maxPages", "40");
        return (
          await import("@/app/tools/canonical-audit/actions")
        ).runCanonical(null, form);
      },
    },
    {
      toolId: "soft-404",
      label: "Pages that say not-found with a 200",
      // Also weekly and also a crawl. A soft 404 is the failure that
      // wastes crawl budget silently: Google keeps requesting a page
      // that has nothing on it because the server keeps saying it is
      // fine.
      cadence: "weekly",
      run: async (c) => {
        const form = new FormData();
        form.set("startUrl", c.url);
        form.set("maxPages", "40");
        return (await import("@/app/tools/soft-404/actions")).runSoft404(
          null,
          form,
        );
      },
    },
    {
      toolId: "security",
      label: "Security headers, TLS and certificate expiry",
      // Two external APIs rather than a fetch of the site, so it is the
      // slowest thing here — but it is the only check that catches a
      // certificate about to lapse, which is the failure that takes a
      // whole site off the internet and always looks fine until it does.
      // Worth a nightly call; not worth asking somebody to remember.
      run: async (c) =>
        (await import("@/app/tools/security/actions")).checkSecurity(
          c.url,
          c.id,
        ),
    },
  ];
}

export type SweepOutcome = {
  clientId: number;
  toolId: string;
  ok: boolean;
  error?: string;
};

/**
 * Whether a check actually did its job.
 *
 * Most of these are form actions, and a form action reports failure by
 * returning `{ ok: false, error }` rather than by throwing — so catching
 * exceptions catches almost nothing. The sweep logged a cheerful "ok"
 * for a check that returned an error and recorded no run at all, which
 * is the same shape as every other bug this project has had to dig out:
 * a success report over a no-op.
 *
 * Anything that does not look like a state object is taken at face
 * value. Several checks return a plain result with no `ok` field, and
 * guessing about those would trade one wrong answer for another.
 */
export function outcomeOf(result: unknown): { ok: boolean; error?: string } {
  if (result && typeof result === "object" && "ok" in result) {
    const r = result as { ok?: unknown; error?: unknown };
    if (r.ok === false) {
      return {
        ok: false,
        error:
          typeof r.error === "string" ? r.error : "the tool reported a failure",
      };
    }
  }
  return { ok: true };
}

/**
 * Run every sweepable check for every client.
 *
 * One failure never stops the sweep. A client whose site is down would
 * otherwise silently cancel the checks for every client after it in the
 * list — the kind of failure that looks like "the scheduler stopped
 * working" months later.
 */
export async function tickToolSweep(
  cadence: "daily" | "weekly" = "daily",
): Promise<SweepOutcome[]> {
  const rows = await db
    .select({ id: clients.id, url: clients.url, gscProperty: clients.gscProperty })
    .from(clients);

  const out: SweepOutcome[] = [];
  for (const c of rows) {
    if (!c.url) continue;
    for (const check of checks()) {
      // Default daily, so a check that says nothing about cadence keeps
      // the behaviour it had before the tier existed.
      if ((check.cadence ?? "daily") !== cadence) continue;
      if (check.requires && !check.requires(c)) continue;
      try {
        const result = await withClientContext(c.id, () => check.run(c));
        out.push({ clientId: c.id, toolId: check.toolId, ...outcomeOf(result) });
      } catch (err) {
        out.push({
          clientId: c.id,
          toolId: check.toolId,
          ok: false,
          error: (err as Error).message,
        });
      }
    }
  }
  return out;
}

/**
 * The ids this file actually runs.
 *
 * The list the UI badges lives in swept-tools.ts, which imports nothing.
 * tool-sweep.test.ts asserts the two agree — one of them being wrong is
 * a badge that promises a check nobody performs.
 */
export function sweptToolIds(): string[] {
  return checks().map((c) => c.toolId);
}

/** Run the sweep for one client — used after onboarding a new client. */
export async function sweepClient(clientId: number): Promise<SweepOutcome[]> {
  const [c] = await db
    .select({ id: clients.id, url: clients.url, gscProperty: clients.gscProperty })
    .from(clients)
    .where(eq(clients.id, clientId));
  if (!c?.url) return [];

  const out: SweepOutcome[] = [];
  for (const check of checks()) {
    if (check.requires && !check.requires(c)) continue;
    try {
      const result = await withClientContext(c.id, () => check.run(c));
      out.push({ clientId: c.id, toolId: check.toolId, ...outcomeOf(result) });
    } catch (err) {
      out.push({
        clientId: c.id,
        toolId: check.toolId,
        ok: false,
        error: (err as Error).message,
      });
    }
  }
  return out;
}
