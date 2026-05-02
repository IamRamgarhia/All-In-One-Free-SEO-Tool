"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients, cwvReports } from "@/db/schema";
import { scanCwv } from "@/lib/pagespeed";

export type RunCwvResult =
  | {
      ok: true;
      id: number;
      performance: number | null;
      overall: "pass" | "needs_improvement" | "fail" | null;
    }
  | { ok: false; error: string };

export async function runCwvScan(opts: {
  clientId: number;
  url: string;
  strategy: "mobile" | "desktop";
}): Promise<RunCwvResult> {
  const url = opts.url.trim();
  if (!url) return { ok: false, error: "URL is required" };
  const normalised = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  const result = await scanCwv({ url: normalised, strategy: opts.strategy });

  const [row] = await db
    .insert(cwvReports)
    .values({
      clientId: opts.clientId,
      url: normalised,
      strategy: opts.strategy,
      performance: result.performance,
      accessibility: result.accessibility,
      bestPractices: result.bestPractices,
      seo: result.seo,
      lcpMs: result.lcpMs,
      inpMs: result.inpMs,
      cls: result.cls,
      ttfbMs: result.ttfbMs,
      fcpMs: result.fcpMs,
      tbtMs: result.tbtMs,
      opportunities: result.opportunities,
      overall: result.overall,
      error: result.error ?? null,
    })
    .returning({ id: cwvReports.id });

  revalidatePath(`/cwv/c/${opts.clientId}`);

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Scan failed" };
  }
  return {
    ok: true,
    id: row.id,
    performance: result.performance,
    overall: result.overall,
  };
}

export async function deleteCwvReport(id: number, clientId: number) {
  await db.delete(cwvReports).where(eq(cwvReports.id, id));
  revalidatePath(`/cwv/c/${clientId}`);
}
