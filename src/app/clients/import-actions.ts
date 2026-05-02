"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { detectTechStack } from "@/lib/tech-detect";
import { logActivity } from "@/lib/activity";

const niches = ["local", "ecommerce", "saas", "blog", "services"] as const;

export type ImportClientsResult =
  | { ok: true; added: number; skipped: number; total: number }
  | { ok: false; error: string };

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
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const rowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .min(1)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  niche: z.string().trim().toLowerCase().optional(),
});

export async function importClientsCsv(
  _prev: ImportClientsResult | null,
  formData: FormData,
): Promise<ImportClientsResult> {
  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { ok: false, error: "CSV is empty." };

  const rows = parseCsv(csv);
  if (rows.length === 0) return { ok: false, error: "No rows parsed." };

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const nameIdx = header.indexOf("name");
  const urlIdx = header.indexOf("url");
  const nicheIdx = header.indexOf("niche");

  let dataRows: string[][];
  let nameCol = nameIdx;
  let urlCol = urlIdx;
  let nicheCol = nicheIdx;

  if (nameIdx === -1 || urlIdx === -1) {
    // No header → treat as name,url,niche
    dataRows = rows;
    nameCol = 0;
    urlCol = 1;
    nicheCol = 2;
  } else {
    dataRows = rows.slice(1);
  }

  // Existing URLs (for dedup)
  const existing = await db
    .select({ url: clients.url })
    .from(clients);
  const existingSet = new Set(
    existing.map((e) =>
      e.url.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
    ),
  );

  let added = 0;
  let skipped = 0;
  for (const r of dataRows) {
    const raw = {
      name: (r[nameCol] ?? "").trim(),
      url: (r[urlCol] ?? "").trim(),
      niche: nicheCol >= 0 ? (r[nicheCol] ?? "").trim().toLowerCase() : "",
    };
    if (!raw.name || !raw.url) {
      skipped++;
      continue;
    }
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      continue;
    }

    const dedupeKey = parsed.data.url
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (existingSet.has(dedupeKey)) {
      skipped++;
      continue;
    }
    existingSet.add(dedupeKey);

    const niche =
      parsed.data.niche &&
      (niches as readonly string[]).includes(parsed.data.niche)
        ? (parsed.data.niche as (typeof niches)[number])
        : null;

    // Best-effort tech detection (don't block bulk import on slow detections)
    let detectedStack: string[] | null = null;
    try {
      const detection = await detectTechStack(parsed.data.url);
      detectedStack = detection.technologies.map((t) => t.name);
    } catch {
      // skip
    }

    const [row] = await db
      .insert(clients)
      .values({
        name: parsed.data.name,
        url: parsed.data.url,
        niche,
        techStack: detectedStack,
      })
      .returning({ id: clients.id });

    await logActivity({
      kind: "client.created",
      message: `Imported client ${parsed.data.name}.`,
      level: "info",
      clientId: row.id,
      entityType: "client",
      entityId: row.id,
    });

    added++;
  }

  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true, added, skipped, total: added + skipped };
}
