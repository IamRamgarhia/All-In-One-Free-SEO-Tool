import { NextRequest, NextResponse } from "next/server";
import { runAudit } from "@/lib/audit";
import { generateGraderPdf } from "@/lib/grader-report";

export const dynamic = "force-dynamic";

/**
 * Re-runs the public grader audit for a given URL and streams back a PDF. We
 * re-run rather than accept arbitrary findings in the request body so the
 * report can't be tampered with from the client.
 */
export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

  let audit;
  try {
    audit = await runAudit(url, { maxPages: 1, maxDepth: 0 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Audit failed" },
      { status: 500 },
    );
  }

  if (audit.pagesCrawled === 0) {
    return NextResponse.json(
      {
        error:
          "Couldn't reach that URL. Check it loads in a normal browser, then try again.",
      },
      { status: 422 },
    );
  }

  const counts = {
    critical: audit.findings.filter((f) => f.severity === "critical").length,
    high: audit.findings.filter((f) => f.severity === "high").length,
    medium: audit.findings.filter((f) => f.severity === "medium").length,
    low: audit.findings.filter((f) => f.severity === "low").length,
  };
  const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const ranked = [...audit.findings].sort(
    (a, b) =>
      order[a.severity as keyof typeof order] -
      order[b.severity as keyof typeof order],
  );

  const pdf = await generateGraderPdf({
    url: audit.url,
    finalUrl: audit.finalUrl,
    score: audit.score,
    pagesCrawled: audit.pagesCrawled,
    counts,
    findings: ranked,
  });

  const filenameSafe = hostFor(audit.finalUrl).replace(/[^a-z0-9.-]/gi, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filenameSafe}-instant-audit.pdf"`,
      "cache-control": "no-store",
    },
  });
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "audit";
  }
}
