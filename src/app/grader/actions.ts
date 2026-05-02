"use server";

import { z } from "zod";
import { runAudit, type AuditFinding } from "@/lib/audit";

const inputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
});

export type GraderResult =
  | {
      ok: true;
      url: string;
      finalUrl: string;
      score: number;
      pagesCrawled: number;
      counts: { critical: number; high: number; medium: number; low: number };
      topFindings: AuditFinding[];
    }
  | { ok: false; error: string };

export async function gradeSite(
  _prev: GraderResult | null,
  formData: FormData,
): Promise<GraderResult> {
  const parsed = inputSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid URL." };
  }

  let result;
  try {
    // Fast path: just the homepage. Public-grader UX is "60-second audit."
    result = await runAudit(parsed.data.url, { maxPages: 1, maxDepth: 0 });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  if (result.pagesCrawled === 0) {
    return {
      ok: false,
      error:
        "Couldn't reach that URL. Check it loads in a normal browser, then try again.",
    };
  }

  const counts = {
    critical: result.findings.filter((f) => f.severity === "critical").length,
    high: result.findings.filter((f) => f.severity === "high").length,
    medium: result.findings.filter((f) => f.severity === "medium").length,
    low: result.findings.filter((f) => f.severity === "low").length,
  };

  // Top 6 findings, biased toward severity
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const topFindings = [...result.findings]
    .sort(
      (a, b) =>
        order[a.severity as keyof typeof order] -
        order[b.severity as keyof typeof order],
    )
    .slice(0, 6);

  return {
    ok: true,
    url: result.url,
    finalUrl: result.finalUrl,
    score: result.score,
    pagesCrawled: result.pagesCrawled,
    counts,
    topFindings,
  };
}
