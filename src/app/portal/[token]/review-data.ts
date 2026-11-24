import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { contentPosts, publishQueue } from "@/db/schema";

/** Longest comment a client can leave with a request for changes. */
export const REVIEW_COMMENT_MAX = 1000;

/** What the client is asked to approve, as the portal shows it. */
export type ReviewEntry = {
  kind: "queue" | "article";
  id: number;
  /** blog_draft, gbp_post, social_post or article: the label shown. */
  type: "blog_draft" | "gbp_post" | "social_post" | "article";
  title: string;
  /** Readable text: the whole draft for a queue item, an excerpt for an article. */
  text: string;
  /** The article's page in the portal. */
  href: string | null;
  sentAt: Date;
  decision: "approved" | "changes" | null;
  comment: string | null;
  decidedAt: Date | null;
};

/** How many answered items stay visible, for the record. */
const ANSWERED_SHOWN = 6;

/**
 * Drafts the agency sent this client for approval: those still waiting
 * for an answer, then the latest answered ones, read-only.
 */
export async function reviewEntriesFor(
  clientId: number,
  token: string,
): Promise<{ waiting: ReviewEntry[]; answered: ReviewEntry[] }> {
  const [items, posts] = await Promise.all([
    db
      .select()
      .from(publishQueue)
      .where(
        and(
          eq(publishQueue.clientId, clientId),
          isNotNull(publishQueue.clientSharedAt),
          inArray(publishQueue.kind, ["blog_draft", "gbp_post", "social_post"]),
        ),
      )
      .orderBy(desc(publishQueue.clientSharedAt))
      .limit(40),
    db
      .select()
      .from(contentPosts)
      .where(
        and(
          eq(contentPosts.clientId, clientId),
          isNotNull(contentPosts.reviewSharedAt),
          ne(contentPosts.status, "published"),
        ),
      )
      .orderBy(desc(contentPosts.reviewSharedAt))
      .limit(40),
  ]);

  const entries: (ReviewEntry & { open: boolean })[] = [
    ...items
      // Settled by the agency before the client answered: nothing to ask.
      .filter((i) => i.clientDecision || i.status === "pending_review")
      .map((i) => ({
        kind: "queue" as const,
        id: i.id,
        type: i.kind as ReviewEntry["type"],
        title: i.title?.trim() || "",
        text: readableText(i.body ?? ""),
        href: null,
        sentAt: i.clientSharedAt!,
        decision: i.clientDecision ?? null,
        comment: i.clientComment ?? null,
        decidedAt: i.clientDecidedAt ?? null,
        open: !i.clientDecision,
      })),
    ...posts.map((p) => ({
      kind: "article" as const,
      id: p.id,
      type: "article" as const,
      title: p.title?.trim() || p.primaryKeyword || "",
      text: p.metaDescription?.trim() || excerpt(readableText(markdownToPlain(p.draftMarkdown ?? "")), 320),
      href: `/portal/${token}/articles/${p.id}`,
      sentAt: p.reviewSharedAt!,
      decision: p.clientDecision ?? null,
      comment: p.clientComment ?? null,
      decidedAt: p.clientDecidedAt ?? null,
      open: !p.clientDecision,
    })),
  ];

  const strip = ({ open: _open, ...e }: ReviewEntry & { open: boolean }): ReviewEntry => e;
  return {
    waiting: entries
      .filter((e) => e.open)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .map(strip),
    answered: entries
      .filter((e) => !e.open)
      .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
      .slice(0, ANSWERED_SHOWN)
      .map(strip),
  };
}

/**
 * Plain text from a draft body. Blog drafts are HTML; the portal shows
 * text only, so no markup the generator produced ever reaches the page
 * as HTML.
 */
export function readableText(body: string): string {
  return body
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|ul|ol|blockquote|div)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function excerpt(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/\s+\S*$/, "")}…`;
}
