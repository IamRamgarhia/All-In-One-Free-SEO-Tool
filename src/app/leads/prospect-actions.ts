"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { graderLeads } from "@/db/schema";
import { requireSignedIn } from "@/lib/action-guard";
import { actionTx } from "@/lib/action-tx";
import { runAudit } from "@/lib/audit";
import { isNafCode, isPostcode, searchLocalBusinesses, type LocalBusiness } from "@/lib/prospect-search";
import { findBusinessSite } from "@/lib/prospect-site";

export type ProspectSearchState =
  | { ok: true; businesses: LocalBusiness[]; total: number; page: number; pages: number }
  | { ok: false; error: string }
  | null;

export async function searchProspects(_prev: ProspectSearchState, formData: FormData): Promise<ProspectSearchState> {
  await requireSignedIn();
  const tx = await actionTx("leads.prospecting");
  const naf = String(formData.get("naf") ?? "").trim().toUpperCase();
  const postcode = String(formData.get("postcode") ?? "").trim();
  const page = Number(formData.get("page") ?? 1) || 1;
  if (!isPostcode(postcode)) return { ok: false, error: tx("errorPostcode") };
  if (!isNafCode(naf)) return { ok: false, error: tx("errorTrade") };
  const r = await searchLocalBusinesses({ naf, postcode, page });
  if (!r.ok) return { ok: false, error: r.error === "rate-limited" ? tx("errorRateLimited") : tx("errorRegister") };
  return { ok: true, businesses: r.businesses, total: r.total, page, pages: r.pages };
}

export async function findProspectSite(
  name: string,
  city: string,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  await requireSignedIn();
  const tx = await actionTx("leads.prospecting");
  const r = await findBusinessSite(name.slice(0, 120), city.slice(0, 80));
  if (r.ok) return r;
  return { ok: false, error: r.error === "no-api" ? tx("errorNoApi") : tx("errorSiteSearch") };
}

export type ExpressAuditResult =
  | { ok: true; leadId: number; score: number; critical: number; high: number }
  | { ok: false; error: string };

/**
 * The express audit (home page only, as the public grader does) of a
 * prospect's site, saved as a lead: the inbox below already handles
 * notes, status and turning a lead into a client. Re-auditing the same
 * site updates its lead instead of adding another.
 */
export async function auditProspect(input: {
  url: string;
  business: Pick<LocalBusiness, "name" | "siret" | "address">;
}): Promise<ExpressAuditResult> {
  await requireSignedIn();
  const tx = await actionTx("leads.prospecting");
  let url: string;
  try {
    const u = new URL(/^https?:\/\//i.test(input.url.trim()) ? input.url.trim() : `https://${input.url.trim()}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error("bad");
    url = `${u.protocol}//${u.hostname}/`;
  } catch {
    return { ok: false, error: tx("errorUrl") };
  }

  let result;
  try {
    result = await runAudit(url, { maxPages: 1, maxDepth: 0 });
  } catch {
    return { ok: false, error: tx("errorUnreachable") };
  }
  if (result.pagesCrawled === 0) return { ok: false, error: tx("errorUnreachable") };

  const critical = result.findings.filter((f) => f.severity === "critical").length;
  const high = result.findings.filter((f) => f.severity === "high").length;
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const findings = [...result.findings]
    .sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
    .slice(0, 6)
    .map((f) => ({ type: f.type, severity: f.severity, message: f.message }));
  const values = {
    url,
    name: input.business.name.slice(0, 200),
    score: result.score,
    criticalCount: critical,
    highCount: high,
    findingsJson: findings,
    sourcePage: `prospection:${input.business.siret}`,
  };

  const [existing] = await db.select({ id: graderLeads.id }).from(graderLeads).where(eq(graderLeads.url, url)).limit(1);
  let leadId: number;
  if (existing) {
    await db.update(graderLeads).set(values).where(eq(graderLeads.id, existing.id));
    leadId = existing.id;
  } else {
    const [row] = await db
      .insert(graderLeads)
      .values({ ...values, notes: `${input.business.address} · SIRET ${input.business.siret}` })
      .returning({ id: graderLeads.id });
    leadId = row.id;
  }
  revalidatePath("/leads");
  return { ok: true, leadId, score: result.score, critical, high };
}
