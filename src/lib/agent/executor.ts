/**
 * Carries out one planned action against a live site — and proves it.
 *
 * Three rules, each of which exists because of a specific way this could
 * go wrong:
 *
 * 1. **Read before writing.** The previous value is captured from the
 *    CMS itself, not from the audit that spotted the problem. Audits go
 *    stale; someone may have fixed the title by hand this morning. What
 *    we store as `beforeValue` has to be what was actually there a
 *    moment before we replaced it, or the undo restores something wrong.
 *
 * 2. **Verify after writing.** A 200 from the CMS means the request was
 *    accepted, not that the change took effect — an SEO plugin can
 *    silently override the title, a cache can keep serving the old one.
 *    So we read it back. `applied` and `verified` are different states
 *    on purpose; this codebase's recurring failure is the confident
 *    claim nobody checked.
 *
 * 3. **Never write without a recorded undo.** If capturing the previous
 *    value fails, the action fails. An irreversible change to someone
 *    else's website is not a change worth making.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, type AgentAction } from "@/db/schema";
import {
  findPostIdByUrl,
  getClientWpCreds,
  getPostSeo,
  setPostSeo,
  type WpCreds,
} from "../wp-bridge";
import { callAIResult } from "../ai-call";
import type { PlannedAction } from "./planner";

export type ExecuteOutcome = {
  status: "verified" | "applied" | "failed" | "queued" | "proposed";
  actionId: number;
  error?: string;
};

/** Google truncates around here. Not a ranking factor — a display limit. */
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 155;

/**
 * Produce the replacement text for an action.
 *
 * Kept narrow on purpose: the model is asked to write one title for one
 * page whose specific problem we already identified. It is never asked
 * what to change or whether to change it — the planner decided that
 * from measurable facts. A model asked an open question about a website
 * returns a plausible answer every time, including for sites that need
 * nothing done.
 */
export async function draftValue(
  action: PlannedAction,
  context: { siteName: string; pageTitle?: string | null; pageUrl: string },
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const spec = DRAFT_SPECS[action.kind];
  if (!spec) return { ok: false, error: `No drafting rule for ${action.kind}` };

  const res = await callAIResult({
    system: spec.system,
    user: spec.user(action, context),
    maxTokens: 200,
    feature: "general",
  });

  if (!res.ok) return { ok: false, error: res.failure.message };

  const cleaned = cleanDraft(res.text);
  if (!cleaned) return { ok: false, error: "The model returned nothing usable." };

  const problem = spec.validate(cleaned);
  if (problem) {
    // Refusing a bad draft matters more than it looks. Without this the
    // agent would "fix" a 102-character title by writing a 118-character
    // one, record a success, and leave the page worse than it found it.
    return { ok: false, error: problem };
  }

  return { ok: true, value: cleaned };
}

const DRAFT_SPECS: Record<
  string,
  {
    system: string;
    user: (a: PlannedAction, c: { siteName: string; pageUrl: string; pageTitle?: string | null }) => string;
    validate: (v: string) => string | null;
  }
> = {
  write_title: {
    system: `You write page titles for search results. Output ONLY the title — no quotes, no explanation, no alternatives.

Rules:
- Between 30 and ${TITLE_MAX} characters. This is a hard display limit, not a preference.
- Say what the page is actually about. Do not invent facts, offers, prices, or locations that aren't given to you.
- No clickbait, no ALL CAPS, no "| Best 2026 Guide" filler.
- Do not repeat the brand name if it already appears.`,
    user: (a, c) =>
      `Site: ${c.siteName}\nPage: ${c.pageUrl}\nCurrent title: ${a.currentValue ?? "(none)"}\nProblem: ${a.reason}\n\nWrite the replacement title.`,
    validate: (v) => {
      if (v.length > TITLE_MAX)
        return `The replacement is ${v.length} characters, still over the ${TITLE_MAX}-character display limit.`;
      if (v.length < 15) return "The replacement is too short to be useful.";
      return null;
    },
  },
  write_meta_description: {
    system: `You write meta descriptions for search results. Output ONLY the description — no quotes, no explanation.

Rules:
- Between ${META_MIN} and ${META_MAX} characters. Longer gets cut off mid-sentence.
- Describe what the visitor will find on the page. Do not invent facts, prices, guarantees, or claims you weren't given.
- Write for a person deciding whether to click, not for a search engine.
- No keyword stuffing.`,
    user: (a, c) =>
      `Site: ${c.siteName}\nPage: ${c.pageUrl}\nPage title: ${c.pageTitle ?? "(unknown)"}\nCurrent description: ${a.currentValue ?? "(none)"}\nProblem: ${a.reason}\n\nWrite the replacement description.`,
    validate: (v) => {
      if (v.length > META_MAX)
        return `The replacement is ${v.length} characters, still over the ${META_MAX}-character limit.`;
      if (v.length < 60) return "The replacement is too short to describe the page.";
      return null;
    },
  },
};

function cleanDraft(raw: string): string {
  return raw
    .trim()
    // Models wrap output in quotes roughly half the time regardless of
    // instructions. Strip a matched pair only — a title that legitimately
    // ends in a quotation mark should survive.
    .replace(/^["'“”]([\s\S]*)["'“”]$/, "$1")
    .replace(/^(title|meta description|description)\s*:\s*/i, "")
    .split("\n")[0]
    .trim();
}

/**
 * Apply one action. Records a row whatever happens — a failed attempt is
 * part of the audit trail, not something to hide.
 */
export async function executeAction(opts: {
  runId: number | null;
  clientId: number;
  action: PlannedAction;
  newValue: string;
  /** When false, the action is recorded for a human rather than applied. */
  apply: boolean;
  siteName: string;
}): Promise<ExecuteOutcome> {
  const { action } = opts;

  const insert = async (
    fields: Partial<typeof agentActions.$inferInsert>,
  ): Promise<number> => {
    const [row] = await db
      .insert(agentActions)
      .values({
        runId: opts.runId,
        clientId: opts.clientId,
        kind: action.kind,
        targetUrl: action.targetUrl,
        reason: action.reason,
        risk: action.risk,
        afterValue: opts.newValue,
        ...fields,
      })
      .returning({ id: agentActions.id });
    return row.id;
  };

  if (!opts.apply) {
    const id = await insert({
      status: action.risk === "safe" ? "queued" : "proposed",
      beforeValue: action.currentValue ?? null,
    });
    return { status: action.risk === "safe" ? "queued" : "proposed", actionId: id };
  }

  const creds = await getClientWpCreds(opts.clientId);
  if (!creds) {
    const id = await insert({
      status: "failed",
      error: "No usable WordPress credentials for this client.",
    });
    return { status: "failed", actionId: id, error: "No WordPress credentials." };
  }

  const postId = await findPostIdByUrl(creds, action.targetUrl);
  if (postId === null) {
    const id = await insert({
      status: "failed",
      error:
        "Couldn't work out which WordPress post this URL is. The page may be generated by a plugin or a page builder rather than a normal post.",
    });
    return { status: "failed", actionId: id, error: "Could not resolve the page." };
  }

  // Rule 1: read the CURRENT value from the CMS, not from the audit.
  // Without a captured previous value there is no undo, and an
  // irreversible edit to a client's site is not one worth making.
  const current = await getPostSeo(creds, postId);
  if (!current.ok) {
    const id = await insert({
      status: "failed",
      targetRef: String(postId),
      error: `Couldn't read the current value, so there'd be nothing to undo to: ${current.error}`,
    });
    return { status: "failed", actionId: id, error: current.error };
  }

  const before = readField(current.seo, action.kind);

  // The audit may be hours old. If someone already fixed this by hand,
  // overwriting their work with our draft is the wrong outcome.
  if (before && before === opts.newValue) {
    const id = await insert({
      status: "skipped",
      targetRef: String(postId),
      beforeValue: before,
      error: "Already set to this value — nothing to change.",
    });
    return { status: "proposed", actionId: id };
  }

  const write = await writeField(creds, postId, action.kind, opts.newValue);
  if (!write.ok) {
    const id = await insert({
      status: "failed",
      targetRef: String(postId),
      beforeValue: before,
      error: write.error ?? "The CMS rejected the change.",
    });
    return { status: "failed", actionId: id, error: write.error };
  }

  const actionId = await insert({
    status: "applied",
    targetRef: String(postId),
    beforeValue: before,
    appliedAt: new Date(),
  });

  // Rule 2: a 200 means accepted, not effective. An SEO plugin can
  // override the title; a cache can keep serving the old one. Read it
  // back before claiming success.
  const check = await getPostSeo(creds, postId);
  if (check.ok && readField(check.seo, action.kind) === opts.newValue) {
    await db
      .update(agentActions)
      .set({
        status: "verified",
        verifiedAt: new Date(),
        verifyNote: "Read back from the site and confirmed.",
      })
      .where(eq(agentActions.id, actionId));
    return { status: "verified", actionId };
  }

  await db
    .update(agentActions)
    .set({
      verifyNote: check.ok
        ? "The site accepted the change but is still serving the old value. An SEO plugin or a cache may be overriding it."
        : `Couldn't read the page back to confirm: ${check.error}`,
    })
    .where(eq(agentActions.id, actionId));

  return { status: "applied", actionId };
}

/**
 * Put back what was there before.
 *
 * Uses the stored post id rather than re-resolving the URL: a permalink
 * can change between the edit and the undo, and an undo that lands on a
 * different page than the edit did is worse than no undo at all.
 */
export async function revertAction(
  actionId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [action] = await db
    .select()
    .from(agentActions)
    .where(eq(agentActions.id, actionId))
    .limit(1);

  if (!action) return { ok: false, error: "No such action." };
  if (action.status === "reverted") return { ok: true };
  if (action.status !== "applied" && action.status !== "verified") {
    return {
      ok: false,
      error: "That change was never applied to the site, so there's nothing to undo.",
    };
  }
  if (action.beforeValue === null) {
    return {
      ok: false,
      error:
        "No previous value was recorded for this change, so it can't be undone automatically.",
    };
  }
  if (!action.targetRef) {
    return { ok: false, error: "No page reference stored for this change." };
  }

  const creds = await getClientWpCreds(action.clientId);
  if (!creds) return { ok: false, error: "No usable WordPress credentials." };

  const write = await writeField(
    creds,
    Number(action.targetRef),
    action.kind,
    action.beforeValue,
  );
  if (!write.ok) return { ok: false, error: write.error ?? "The CMS rejected the undo." };

  await db
    .update(agentActions)
    .set({ status: "reverted", revertedAt: new Date() })
    .where(eq(agentActions.id, actionId));

  return { ok: true };
}

function readField(
  seo: { title: string; metaDescription: string },
  kind: string,
): string | null {
  if (kind === "write_title") return seo.title ?? null;
  if (kind === "write_meta_description") return seo.metaDescription ?? null;
  return null;
}

async function writeField(
  creds: WpCreds,
  postId: number,
  kind: string,
  value: string,
): Promise<{ ok: boolean; error?: string }> {
  if (kind === "write_title") return setPostSeo(creds, postId, { title: value });
  if (kind === "write_meta_description")
    return setPostSeo(creds, postId, { metaDescription: value });
  return { ok: false, error: `The agent can't write ${kind} yet.` };
}

export type { AgentAction };
