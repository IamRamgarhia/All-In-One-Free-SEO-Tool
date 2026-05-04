"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { botLogUploads, clients } from "@/db/schema";

/**
 * Bot user-agent patterns we care about, in priority order. The first regex
 * that matches a UA wins — keeps generic matches like /bot/ from polluting.
 */
const BOT_PATTERNS: { name: string; re: RegExp }[] = [
  { name: "GPTBot", re: /GPTBot/i },
  { name: "ChatGPT-User", re: /ChatGPT-User/i },
  { name: "OAI-SearchBot", re: /OAI-SearchBot/i },
  { name: "ClaudeBot", re: /ClaudeBot/i },
  { name: "Claude-Web", re: /Claude-Web/i },
  { name: "PerplexityBot", re: /PerplexityBot/i },
  { name: "Perplexity-User", re: /Perplexity-User/i },
  { name: "Google-Extended", re: /Google-Extended/i },
  { name: "Bytespider", re: /Bytespider/i },
  { name: "CCBot", re: /CCBot/i },
  { name: "Amazonbot", re: /Amazonbot/i },
  { name: "anthropic-ai", re: /anthropic-ai/i },
  { name: "cohere-ai", re: /cohere-ai/i },
  { name: "FacebookBot", re: /FacebookBot/i },
  { name: "Applebot-Extended", re: /Applebot-Extended/i },
  // Established crawlers (helpful baseline to compare AI bots against)
  { name: "Googlebot", re: /Googlebot/i },
  { name: "Bingbot", re: /bingbot/i },
  { name: "DuckDuckBot", re: /DuckDuckBot/i },
  { name: "YandexBot", re: /YandexBot/i },
];

/**
 * Best-effort UA extraction from a single Nginx/Apache combined-log line.
 * Combined log format: ip - - [date] "GET /path HTTP/1.1" 200 size "ref" "ua"
 * We grab the LAST quoted field — that's the UA in every common format.
 */
function extractUa(line: string): string | null {
  const matches = line.match(/"([^"]*)"/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.slice(1, -1).trim() || null;
}

/** Extract requested path + status code from a combined-log line. */
function extractPathAndStatus(
  line: string,
): { path: string; status: number } | null {
  const reqMatch = line.match(/"(?:GET|POST|HEAD|PUT|DELETE)\s+([^\s"]+)/i);
  if (!reqMatch) return null;
  // Status code follows the closing quote of the request line + a space
  const afterReq = line.slice(line.indexOf('"') + 1);
  const closeQuote = afterReq.indexOf('"');
  const tail = afterReq.slice(closeQuote + 1).trim();
  const statusMatch = tail.match(/^(\d{3})\b/);
  return {
    path: reqMatch[1].split("?")[0].slice(0, 200),
    status: statusMatch ? Number(statusMatch[1]) : 0,
  };
}

function classify(ua: string): string | null {
  for (const { name, re } of BOT_PATTERNS) {
    if (re.test(ua)) return name;
  }
  return null;
}

export type ParseResult = {
  ok: true;
  uploadId: number;
  totalLines: number;
  matchedLines: number;
  botCounts: Record<string, number>;
  /** Top crawled paths across ALL bots — see what they actually crawl. */
  topPaths: { path: string; count: number }[];
  /** Status-code distribution. 4xx/5xx = bots hitting broken pages. */
  statusBreakdown: Record<string, number>;
} | {
  ok: false;
  error: string;
};

export async function parseAndStoreLog(input: {
  text: string;
  sourceName?: string;
  clientId?: number | null;
}): Promise<ParseResult> {
  if (!input.text || input.text.length === 0) {
    return { ok: false, error: "Empty file" };
  }
  const lines = input.text.split(/\r?\n/);
  const counts = new Map<string, number>();
  const pathCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  let matched = 0;
  for (const line of lines) {
    if (!line) continue;
    const ua = extractUa(line);
    if (!ua) continue;
    const bot = classify(ua);
    if (!bot) continue;

    counts.set(bot, (counts.get(bot) ?? 0) + 1);
    matched++;

    const pathStatus = extractPathAndStatus(line);
    if (pathStatus) {
      pathCounts.set(
        pathStatus.path,
        (pathCounts.get(pathStatus.path) ?? 0) + 1,
      );
      const bucket =
        pathStatus.status >= 200 && pathStatus.status < 300
          ? "2xx"
          : pathStatus.status >= 300 && pathStatus.status < 400
            ? "3xx"
            : pathStatus.status >= 400 && pathStatus.status < 500
              ? "4xx"
              : pathStatus.status >= 500
                ? "5xx"
                : "other";
      statusCounts.set(bucket, (statusCounts.get(bucket) ?? 0) + 1);
    }
  }

  const botCounts: Record<string, number> = Object.fromEntries(counts);
  const topPaths = Array.from(pathCounts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  const statusBreakdown: Record<string, number> =
    Object.fromEntries(statusCounts);

  const [row] = await db
    .insert(botLogUploads)
    .values({
      clientId: input.clientId ?? null,
      sourceName: input.sourceName ?? null,
      rawByteSize: input.text.length,
      lineCount: lines.length,
      botCounts,
    })
    .returning({ id: botLogUploads.id });

  revalidatePath("/bot-logs");

  return {
    ok: true,
    uploadId: row.id,
    totalLines: lines.length,
    matchedLines: matched,
    botCounts,
    topPaths,
    statusBreakdown,
  };
}

export async function listUploads(opts?: { limit?: number }) {
  return db
    .select({
      id: botLogUploads.id,
      sourceName: botLogUploads.sourceName,
      rawByteSize: botLogUploads.rawByteSize,
      lineCount: botLogUploads.lineCount,
      botCounts: botLogUploads.botCounts,
      uploadedAt: botLogUploads.uploadedAt,
      clientId: botLogUploads.clientId,
      clientName: clients.name,
    })
    .from(botLogUploads)
    .leftJoin(clients, eq(botLogUploads.clientId, clients.id))
    .orderBy(desc(botLogUploads.uploadedAt))
    .limit(opts?.limit ?? 50);
}

export async function deleteUpload(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) return;
  await db.delete(botLogUploads).where(eq(botLogUploads.id, id));
  revalidatePath("/bot-logs");
}
