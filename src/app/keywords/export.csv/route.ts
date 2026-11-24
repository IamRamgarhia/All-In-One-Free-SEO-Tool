import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings, keywordRankFailures } from "@/db/schema";
import { clientScope } from "@/lib/client-scope";
import {
  absenceOf,
  absenceStringsFromMessages,
  describeAbsence,
  engineLabel,
  readingEngine,
  rankStatus,
} from "@/lib/serp/absence";
import type { RankTx } from "@/lib/serp/describe";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const rows = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      device: keywords.device,
      clientName: clients.name,
      clientUrl: clients.url,
      createdAt: keywords.createdAt,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    // Members and client viewers get their own projects only.
    .where(await clientScope())
    .orderBy(desc(keywords.createdAt));

  // Pull latest position per keyword
  const allRankings = await db
    .select({
      keywordId: keywordRankings.keywordId,
      position: keywordRankings.position,
      url: keywordRankings.url,
      checkedAt: keywordRankings.checkedAt,
      source: keywordRankings.source,
      engine: keywordRankings.engine,
      resultsScanned: keywordRankings.resultsScanned,
    })
    .from(keywordRankings)
    .orderBy(keywordRankings.checkedAt);

  const latest = new Map<number, (typeof allRankings)[number]>();
  for (const r of allRankings) latest.set(r.keywordId, r);

  // The last failed check per keyword: newer than the last reading, the
  // export says "not checked" rather than passing the old reading off as
  // today's, like the keyword page.
  const failures = await db
    .select({ keywordId: keywordRankFailures.keywordId, checkedAt: keywordRankFailures.checkedAt })
    .from(keywordRankFailures)
    .orderBy(keywordRankFailures.checkedAt);
  const lastFailure = new Map<number, Date>();
  for (const f of failures) lastFailure.set(f.keywordId, f.checkedAt);

  // An empty position says which engine was read and how far, never a
  // bare blank (lib/serp/absence).
  const locale = await getLocale();
  const t = (await getTranslations("keywords")) as unknown as RankTx;
  const rt = (await getTranslations("rankCheck")) as unknown as RankTx;
  const strings = absenceStringsFromMessages(t, rt);

  const header = [
    "client",
    "client_url",
    "query",
    "country",
    "device",
    "latest_position",
    "status",
    "status_text",
    "engine",
    "results_scanned",
    "ranking_url",
    "last_checked",
    "added",
  ];

  const csvLines = [header.join(",")];
  for (const r of rows) {
    const lp = latest.get(r.id);
    const status = rankStatus(lp, lastFailure.get(r.id));
    const absence = lp ? absenceOf(lp) : null;
    const statusText =
      status === "not_checked" || status === "never_checked"
        ? t("notChecked")
        : absence
          ? describeAbsence(absence, strings, locale)
          : `#${lp!.position}`;
    const engine =
      lp && lp.source !== "gsc" ? engineLabel(readingEngine(lp), strings.engines, locale) : lp ? rt("engine.gsc") : "";
    csvLines.push(
      [
        r.clientName ?? "",
        r.clientUrl ?? "",
        r.query,
        r.country,
        r.device,
        lp?.position ?? "",
        status,
        statusText,
        engine,
        lp?.resultsScanned ?? "",
        lp?.url ?? "",
        lp?.checkedAt?.toISOString() ?? "",
        r.createdAt.toISOString(),
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const today = new Date().toISOString().split("T")[0];

  return new NextResponse(csvLines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keywords-${today}.csv"`,
    },
  });
}
