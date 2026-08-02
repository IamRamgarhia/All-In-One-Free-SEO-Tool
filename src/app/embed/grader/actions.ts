"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { graderLeads } from "@/db/schema";
import { runAudit, type AuditFinding } from "@/lib/audit";
import {
  ipPrefix,
  looksLikeEmail,
  rateLimit,
  recentLeadFor,
} from "@/lib/grader-public";

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(z.string().url());

export type PublicGradeResult =
  | {
      ok: true;
      leadId: number;
      url: string;
      score: number;
      counts: { critical: number; high: number; medium: number; low: number };
      topFindings: { type: string; severity: string; message: string }[];
    }
  | { ok: false; error: string };

/**
 * Grade a site from the public widget.
 *
 * Reachable by anyone, so it is the one place in this app where an
 * anonymous request makes the server fetch a URL of the caller's
 * choosing. SSRF is refused inside `runAudit` (private and reserved
 * ranges, re-checked per redirect hop); this adds the rate limiting that
 * keeps an agency's small VPS from being used as a free crawler.
 */
export async function publicGrade(
  _prev: PublicGradeResult | null,
  formData: FormData,
): Promise<PublicGradeResult> {
  // Reading the request is all this wrapper does. The work lives in
  // `gradeForVisitor`, which takes the context as arguments — so the
  // safety properties (SSRF refusal, rate limiting) can be exercised
  // without a live request. They could not be before: `headers()` throws
  // outside a request scope, which made the whole path untestable
  // except through a browser.
  const h = await headers();
  return gradeForVisitor({
    url: formData.get("url"),
    ip: h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null,
    referer: h.get("referer"),
  });
}

export async function gradeForVisitor(input: {
  url: FormDataEntryValue | string | null;
  ip: string | null;
  referer: string | null;
}): Promise<PublicGradeResult> {
  const parsed = urlSchema.safeParse(input.url);
  if (!parsed.success) {
    return { ok: false, error: "That doesn't look like a website address." };
  }

  const prefix = ipPrefix(input.ip);

  const limit = rateLimit(prefix);
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterSec / 60);
    return {
      ok: false,
      error: `That's a few audits in quick succession. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    };
  }

  let result;
  try {
    // Homepage only. The promise on the widget is a ten-second answer,
    // and a public endpoint that crawls a whole site on request is an
    // amplification vector regardless of who asked.
    result = await runAudit(parsed.data, { maxPages: 1, maxDepth: 0 });
  } catch {
    return {
      ok: false,
      error: "Couldn't reach that site. Check it loads in a browser and retry.",
    };
  }

  if (result.pagesCrawled === 0) {
    // Includes the SSRF refusal path — a blocked URL crawls nothing.
    // Deliberately the same message either way: telling an anonymous
    // caller "that address is internal" confirms the address exists.
    return {
      ok: false,
      error: "Couldn't reach that site. Check it loads in a browser and retry.",
    };
  }

  const counts = {
    critical: result.findings.filter((f) => f.severity === "critical").length,
    high: result.findings.filter((f) => f.severity === "high").length,
    medium: result.findings.filter((f) => f.severity === "medium").length,
    low: result.findings.filter((f) => f.severity === "low").length,
  };

  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const topFindings = [...result.findings]
    .sort(
      (a, b) =>
        order[a.severity as keyof typeof order] -
        order[b.severity as keyof typeof order],
    )
    .slice(0, 6)
    .map((f: AuditFinding) => ({
      type: f.type,
      severity: f.severity,
      message: f.message,
    }));

  // One lead per URL per day. Someone refreshing the page should not
  // become three entries in an inbox the agency then stops opening.
  const existing = await recentLeadFor(parsed.data);
  if (existing) {
    await db
      .update(graderLeads)
      .set({
        score: result.score,
        criticalCount: counts.critical,
        highCount: counts.high,
        findingsJson: topFindings,
      })
      .where(eq(graderLeads.id, existing.id));
    return {
      ok: true,
      leadId: existing.id,
      url: parsed.data,
      score: result.score,
      counts,
      topFindings,
    };
  }

  const [lead] = await db
    .insert(graderLeads)
    .values({
      url: parsed.data,
      score: result.score,
      criticalCount: counts.critical,
      highCount: counts.high,
      findingsJson: topFindings,
      sourcePage: input.referer?.slice(0, 500) ?? null,
      ipPrefix: prefix,
    })
    .returning({ id: graderLeads.id });

  return {
    ok: true,
    leadId: lead.id,
    url: parsed.data,
    score: result.score,
    counts,
    topFindings,
  };
}

/**
 * Attach contact details to a grade that already happened.
 *
 * Split from grading on purpose. Asking for an email before showing any
 * value is the pattern everyone has learned to close — CLAUDE.md's
 * onboarding rule is value before asking for anything. They see the
 * score first, then decide whether the detail is worth an address.
 */
export async function captureLead(input: {
  leadId: number;
  email: string;
  name?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(input.leadId) || input.leadId <= 0) {
    return { ok: false, error: "Something went wrong — re-run the audit." };
  }
  if (!looksLikeEmail(input.email)) {
    return { ok: false, error: "That email doesn't look right." };
  }

  // Only fills in contact details on a row this endpoint created. It
  // cannot change a URL, a score, or a status, so a guessed id at worst
  // overwrites an email on another lead — no data is exposed, because
  // nothing is returned.
  await db
    .update(graderLeads)
    .set({
      email: input.email.trim().slice(0, 254),
      name: input.name?.trim().slice(0, 120) || null,
    })
    .where(eq(graderLeads.id, input.leadId));

  return { ok: true };
}
