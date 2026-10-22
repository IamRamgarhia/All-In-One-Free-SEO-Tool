import { geoFetch } from "@/lib/geo-audit/fetch";

export const LLMS_CANONICAL_PATH = "/llms.txt";

const H1 = /^#\s+(.+?)\s*$/gm;
const H2 = /^##\s+(.+?)\s*$/gm;
const QUOTE = /^>\s*(.+?)\s*$/gm;
const LINK =
  /^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/gm;

export function parseLlmsTxt(text: string): {
  valid: boolean;
  problems: string[];
} {
  const headings = [...text.matchAll(H1)].map((m) => m[1]!);
  const sections = [...text.matchAll(H2)].map((m) => m[1]!);
  const quotes = [...text.matchAll(QUOTE)].map((m) => m[1]!);
  const links = [...text.matchAll(LINK)];

  const problems: string[] = [];
  if (!headings.length) problems.push("no H1 title");
  else if (headings.length > 1) {
    problems.push(`${headings.length} H1 headings; the format allows one`);
  }
  if (!quotes.length) problems.push("no blockquote summary");
  if (!sections.length) problems.push("no H2 sections");
  if (!links.length) problems.push("no links");

  return { valid: problems.length === 0, problems };
}

export async function fetchLlmsTxt(
  origin: string,
  signal?: AbortSignal,
): Promise<{ present: boolean; valid: boolean | null }> {
  const url = new URL(LLMS_CANONICAL_PATH, origin).toString();
  try {
    const result = await geoFetch(url, {
      timeoutMs: 15_000,
      maxBytes: 512_000,
      signal,
      accept: "text/plain,*/*",
    });
    if (!result.ok) {
      return { present: false, valid: null };
    }
    const parsed = parseLlmsTxt(result.body);
    return { present: true, valid: parsed.valid };
  } catch {
    return { present: false, valid: null };
  }
}
