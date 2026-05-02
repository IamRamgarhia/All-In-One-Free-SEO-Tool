import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";

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
    .orderBy(desc(keywords.createdAt));

  // Pull latest position per keyword
  const allRankings = await db
    .select({
      keywordId: keywordRankings.keywordId,
      position: keywordRankings.position,
      url: keywordRankings.url,
      checkedAt: keywordRankings.checkedAt,
    })
    .from(keywordRankings)
    .orderBy(keywordRankings.checkedAt);

  const latest = new Map<
    number,
    { position: number | null; url: string | null; checkedAt: Date }
  >();
  for (const r of allRankings) {
    latest.set(r.keywordId, {
      position: r.position,
      url: r.url,
      checkedAt: r.checkedAt,
    });
  }

  const header = [
    "client",
    "client_url",
    "query",
    "country",
    "device",
    "latest_position",
    "ranking_url",
    "last_checked",
    "added",
  ];

  const csvLines = [header.join(",")];
  for (const r of rows) {
    const lp = latest.get(r.id);
    csvLines.push(
      [
        r.clientName ?? "",
        r.clientUrl ?? "",
        r.query,
        r.country,
        r.device,
        lp?.position ?? "",
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
