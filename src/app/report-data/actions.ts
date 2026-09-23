"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, manualReportData } from "@/db/schema";
import { callAI, lastAiFailure } from "@/lib/ai-call";

export type ParseState =
  | {
      ok: true;
      added: number;
      items: {
        kind: string;
        title: string;
        url: string | null;
        details: Record<string, unknown> | null;
      }[];
    }
  | { ok: false; error: string }
  | null;

const SYSTEM = `You are a data extractor. The user pastes free-form text describing SEO work they did this month — backlinks built, outreach emails sent, comments posted, social shares, reviews logged, milestones, or general notes. Your job: extract one structured entry per item in the text.

Output STRICT JSON, no preamble, no markdown fences:
{
  "items": [
    {
      "kind": "backlink" | "outreach" | "comment" | "social_post" | "review" | "milestone" | "note",
      "title": "<one-line description, 5-15 words>",
      "url": "<https URL if mentioned, else null>",
      "details": { /* any specific data the text mentions */ }
    }
  ]
}

Rules:
- One item per discrete piece of work. A list of 5 backlinks = 5 items.
- "kind" classification:
    backlink     — got a link from another site (mentions URL + anchor/source)
    outreach     — sent an email / message / DM to someone
    comment      — posted a comment somewhere
    social_post  — posted on LinkedIn, X, Reddit, etc.
    review       — solicited or got a review
    milestone    — first sale, broke a rank position, hit a metric
    note         — anything else worth tracking but uncategorised
- "title": short, declarative, useful in a monthly client report.
- "url": only if explicitly in the text. Don't invent.
- "details": extract any specific data (anchor text, DA score, contact name,
  platform, rank position, etc.) into JSON properties. Empty object if none.
- Skip empty lines, headers, separators — extract real data only.`;

export async function parseReportDataPaste(
  _prev: ParseState,
  formData: FormData,
): Promise<ParseState> {
  const clientId = Number(formData.get("clientId"));
  const rawText = String(formData.get("rawText") ?? "").trim();

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return { ok: false, error: "Pick a client first." };
  }
  if (!rawText) {
    return { ok: false, error: "Paste some text to extract." };
  }
  if (rawText.length > 20_000) {
    return {
      ok: false,
      error: "Too much text at once — paste up to ~20,000 chars per run.",
    };
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };

  const raw = await callAI({
    system: SYSTEM,
    user: `Client: ${client.name}\n\nText:\n${rawText}\n\nReturn JSON only.`,
    maxTokens: 4000,
    temperature: 0.2,
    feature: "general",
    ignoreCreditSaver: true,
  });

  if (!raw) {
    return {
      ok: false,
      error:
        lastAiFailure()?.message ?? "AI provider didn't respond. Configure one in Settings → AI, or click Test next to your provider to see the actual error.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  let parsed: {
    items?: {
      kind: string;
      title: string;
      url: string | null;
      details: Record<string, unknown> | null;
    }[];
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "AI returned malformed JSON. Try again." };
  }

  const items = parsed.items ?? [];
  if (items.length === 0) {
    return {
      ok: false,
      error: "AI found no actionable items in the pasted text.",
    };
  }

  const validKinds = new Set([
    "backlink",
    "outreach",
    "comment",
    "social_post",
    "review",
    "milestone",
    "note",
  ]);

  const rows = items
    .filter((it) => validKinds.has(it.kind) && it.title)
    .map((it) => ({
      clientId,
      kind: it.kind as
        | "backlink"
        | "outreach"
        | "comment"
        | "social_post"
        | "review"
        | "milestone"
        | "note",
      title: it.title.slice(0, 300),
      url: it.url?.slice(0, 500) ?? null,
      details: it.details ?? null,
      rawText: rawText.slice(0, 2000),
      happenedAt: new Date(),
    }));

  if (rows.length === 0) {
    return { ok: false, error: "All items failed validation." };
  }

  await db.insert(manualReportData).values(rows);
  revalidatePath("/report-data");

  return {
    ok: true,
    added: rows.length,
    items: rows.map((r) => ({
      kind: r.kind,
      title: r.title,
      url: r.url,
      details: r.details,
    })),
  };
}

export async function deleteEntry(id: number): Promise<void> {
  await db.delete(manualReportData).where(eq(manualReportData.id, id));
  revalidatePath("/report-data");
}

export async function listForClient(clientId: number) {
  return db
    .select()
    .from(manualReportData)
    .where(eq(manualReportData.clientId, clientId))
    .orderBy(desc(manualReportData.createdAt))
    .limit(200);
}
