"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, keywords } from "@/db/schema";

export type ImportResult =
  | { ok: true; added: number; skipped: number; total: number }
  | { ok: false; error: string };

/**
 * Parse a CSV string respecting quoted values + embedded commas/newlines.
 * Tiny enough to keep inline; avoids pulling in csv-parse for one feature.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch === "\r") {
        // skip
      } else {
        cell += ch;
      }
    }
  }
  // last cell / row
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export async function importKeywords(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  const csv = String(formData.get("csv") ?? "").trim();
  const targetClientId = Number(formData.get("clientId"));
  if (!csv) return { ok: false, error: "CSV is empty." };
  if (!Number.isFinite(targetClientId) || targetClientId <= 0) {
    return { ok: false, error: "Pick a target client." };
  }

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, targetClientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };

  const rows = parseCsv(csv);
  if (rows.length === 0) return { ok: false, error: "No rows parsed." };

  // Detect header — accept several common shapes:
  //   query
  //   keyword
  //   query,country,device
  //   query,country
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const queryIdx =
    header.indexOf("query") !== -1
      ? header.indexOf("query")
      : header.indexOf("keyword");
  const countryIdx = header.indexOf("country");
  const deviceIdx = header.indexOf("device");

  let dataRows: string[][];
  let queryCol: number;
  if (queryIdx !== -1) {
    dataRows = rows.slice(1);
    queryCol = queryIdx;
  } else {
    // No header — treat first column of every row as the query
    dataRows = rows;
    queryCol = 0;
  }

  // Existing keywords for this client (for dedup)
  const existing = await db
    .select({ query: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, targetClientId));
  const existingSet = new Set(existing.map((e) => e.query.toLowerCase().trim()));

  let added = 0;
  let skipped = 0;
  const toInsert: {
    clientId: number;
    query: string;
    country: string;
    device: "desktop" | "mobile";
  }[] = [];

  for (const r of dataRows) {
    const query = (r[queryCol] ?? "").trim();
    if (!query) {
      skipped++;
      continue;
    }
    const normalized = query.toLowerCase();
    if (existingSet.has(normalized)) {
      skipped++;
      continue;
    }
    existingSet.add(normalized);

    const country =
      countryIdx !== -1 ? (r[countryIdx] ?? "US").trim().toUpperCase() : "US";
    const deviceRaw =
      deviceIdx !== -1 ? (r[deviceIdx] ?? "desktop").trim().toLowerCase() : "desktop";
    const device = deviceRaw === "mobile" ? "mobile" : "desktop";

    toInsert.push({ clientId: targetClientId, query, country, device });
    added++;
  }

  if (toInsert.length > 0) {
    await db.insert(keywords).values(toInsert);
  }

  revalidatePath("/keywords");
  // Quiet the unused-import warning
  void and;

  return {
    ok: true,
    added,
    skipped,
    total: added + skipped,
  };
}
