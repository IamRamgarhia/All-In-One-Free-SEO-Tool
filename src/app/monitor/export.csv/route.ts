import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, monitoredPages, pageChanges } from "@/db/schema";
import { csvResponse } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: pageChanges.id,
      field: pageChanges.field,
      severity: pageChanges.severity,
      oldValue: pageChanges.oldValue,
      newValue: pageChanges.newValue,
      detectedAt: pageChanges.detectedAt,
      url: monitoredPages.url,
      label: monitoredPages.label,
      clientName: clients.name,
      clientUrl: clients.url,
    })
    .from(pageChanges)
    .innerJoin(
      monitoredPages,
      eq(pageChanges.monitoredPageId, monitoredPages.id),
    )
    .leftJoin(clients, eq(monitoredPages.clientId, clients.id))
    .orderBy(desc(pageChanges.detectedAt));

  return csvResponse(
    "page-changes.csv",
    [
      "id",
      "client",
      "client_url",
      "page_url",
      "page_label",
      "field",
      "severity",
      "old_value",
      "new_value",
      "detected_at",
    ],
    rows.map((r) => [
      r.id,
      r.clientName,
      r.clientUrl,
      r.url,
      r.label,
      r.field,
      r.severity,
      r.oldValue,
      r.newValue,
      r.detectedAt,
    ]),
  );
}
