import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { slugify } from "@/lib/blog-export";

/**
 * Where blog drafts are written for Claude to read. Outside the client's
 * project so nothing lands in their repository; the chat is given access
 * to this folder with --add-dir.
 */
export const DRAFTS_DIR = path.join(process.cwd(), ".seo-drafts");

export function writeDraft(clientId: number, title: string | null, markdown: string): string {
  const dir = path.join(DRAFTS_DIR, String(clientId));
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(title ?? "draft", 60) || "draft"}.md`);
  writeFileSync(file, markdown, "utf8");
  return file;
}
