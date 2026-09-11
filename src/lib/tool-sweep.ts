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
 * Run every sweepable check for every client.
 *
 * One failure never stops the sweep. A client whose site is down would
 * otherwise silently cancel the checks for every client after it in the
 * list — the kind of failure that looks like "the scheduler stopped
 * working" months later.
 */
export async function tickToolSweep(): Promise<SweepOutcome[]> {
  const rows = await db
    .select({ id: clients.id, url: clients.url, gscProperty: clients.gscProperty })
    .from(clients);

  const out: SweepOutcome[] = [];
  for (const c of rows) {
    if (!c.url) continue;
    for (const check of checks()) {
      if (check.requires && !check.requires(c)) continue;
      try {
        await withClientContext(c.id, () => check.run(c));
        out.push({ clientId: c.id, toolId: check.toolId, ok: true });
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
      await withClientContext(c.id, () => check.run(c));
      out.push({ clientId: c.id, toolId: check.toolId, ok: true });
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
