export const dynamic = "force-dynamic";

import Link from "next/link";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ArrowLeft, Globe } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { getEdgeToken } from "@/lib/edge-token";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { EdgeSetup } from "./setup";

/**
 * Installing the edge worker.
 *
 * Automatic fixes go through the WordPress plugin, so a PHP site, a
 * static site or a React app gets the finding and the instructions and
 * nothing else. This is the answer for anything behind Cloudflare,
 * whatever it is built in.
 *
 * The page leads with why this rather than the pixel every paid tool
 * uses, because that is the decision the reader is actually making and
 * the reason is not obvious.
 */
export default async function EdgeSettingsPage() {
  const [token, rows] = await Promise.all([
    getEdgeToken(),
    db.select({ id: clients.id, name: clients.name, url: clients.url }).from(clients),
  ]);

  let worker = "";
  try {
    worker = await readFile(
      join(process.cwd(), "edge-worker/seo-tool-worker.js"),
      "utf8",
    );
  } catch {
    worker = "";
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/settings"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to settings
        </Link>
        <PageHeader
          title="Edge worker"
          description="Apply fixes to any site behind Cloudflare — PHP, static HTML, React, anything. No plugin, no CMS required."
          icon={Globe}
          accent="cyan"
        />
      </div>

      <section className="glass-apple rounded-2xl p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Why a worker and not a script tag
        </h2>
        <p>
          The paid tools that apply fixes to any site mostly use a JavaScript
          snippet that rewrites the page in the visitor&apos;s browser. It is
          easier to install and it has a problem: AI crawlers do not run
          JavaScript. Vercel and MERJ measured over 500 million GPTBot fetches
          and found no evidence of execution, and ClaudeBot downloaded scripts
          in roughly a quarter of requests without running any of them.
        </p>
        <p className="mt-2">
          So a fix applied that way is invisible to ChatGPT, Claude and
          Perplexity. A worker rewrites the HTML before it leaves the server,
          which means a crawler that never executes anything still sees it.
          The fixes also stay in your own infrastructure rather than ours.
        </p>
      </section>

      <EdgeSetup
        hasToken={Boolean(token)}
        appUrl=""
        clients={rows.map((c) => ({ id: c.id, name: c.name, url: c.url }))}
        workerSource={worker}
      />

      <section className="glass-apple rounded-2xl p-5">
        <h2 className="mb-2 text-sm font-semibold">Checking it works</h2>
        <p className="text-sm text-muted-foreground">
          The worker sets a header naming what it changed, so this is
          answerable with one command rather than by reading the page and
          guessing.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 text-[12px] leading-relaxed text-foreground/90">
          curl -sI https://yoursite.com | grep x-seo-tool
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          <code>x-seo-tool: title,description</code> means it rewrote those two.{" "}
          <code>none</code> means the worker is running and has no fix for that
          page yet. No header at all means the route is not matching.
        </p>
      </section>
    </div>
  );
}
