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
  getPostImages,
  getPostSeo,
  setAttachmentAlt,
  setPostSchema,
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
/**
 * Does this kind need a value written for it before it can be applied?
 *
 * True for every kind the agent can execute — all four are "put content
 * here", and there is no such thing as applying one with nothing.
 *
 * This exists because run.ts had its own inline list of two kinds, and
 * the two it left out (alt text, schema) skipped drafting entirely and
 * were executed with an empty string. Writing "" as alt text then
 * verified perfectly — the read-back matched, because nothing had
 * changed — so the agent reported images as fixed, closed the finding,
 * and left every one of them without alt text.
 *
 * Derived from the drafting paths that actually exist rather than
 * restated, so adding a kind can't silently skip drafting again.
 */
export function requiresDraft(kind: string): boolean {
  return kind === "write_schema" || kind in DRAFT_SPECS;
}

export async function draftValue(
  action: PlannedAction,
  context: { siteName: string; pageTitle?: string | null; pageUrl: string },
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  // Schema doesn't go through the prompt table. It has a purpose-built
  // generator that reads the page and refuses to invent fields that
  // aren't demonstrably there — which matters far more for structured
  // data than for a title, because invented author names, prices or
  // ratings in JSON-LD are a manual-action risk, not just bad copy.
  if (action.kind === "write_schema") {
    return draftSchema(action.targetUrl);
  }

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

/**
 * Produce JSON-LD for a page.
 *
 * Takes the highest-confidence suggestion only. The generator returns up
 * to three, and picking between them is a judgement call — so an agent
 * running unattended takes the first (the generator orders by fit) and
 * the action is marked `needs_review` by the planner, meaning a human
 * sees it before it ships unless the user has opted into full autopilot.
 *
 * Validates that it parses. A malformed JSON-LD block is worse than none
 * — Google ignores it and the page looks like it has structured data
 * when it doesn't, which is exactly the sort of silent wrongness that
 * survives for months.
 */
async function draftSchema(
  url: string,
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const { generateSchemaFromUrl } = await import("../ai-schema-gen");
  const result = await generateSchemaFromUrl({ url });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.suggestions.length === 0) {
    return {
      ok: false,
      error:
        "No schema type fits this page. That's a legitimate answer — not every page qualifies for a rich result.",
    };
  }

  const jsonLd = result.suggestions[0].jsonLd.trim();
  try {
    const parsed = JSON.parse(jsonLd);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const ctx = (parsed as Record<string, unknown>)["@context"];
    const type = (parsed as Record<string, unknown>)["@type"];
    if (!ctx || !type) {
      return {
        ok: false,
        error: "The generated schema is missing @context or @type.",
      };
    }
  } catch {
    return {
      ok: false,
      error:
        "The generated schema isn't valid JSON. Refusing to write it — broken JSON-LD is worse than none, because the page looks marked up and isn't.",
    };
  }

  return { ok: true, value: jsonLd };
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
  write_image_alt: {
    system: `You write alt text for images. Output ONLY the alt text — no quotes, no explanation, no "image of".

Rules:
- Under 125 characters. Screen readers cut off around there.
- Describe what is IN the image, for someone who cannot see it.
- You are given the filename and the page it appears on, and nothing else. Do NOT invent details you cannot know — no colours, no counts, no facial expressions, no text-in-image. If the filename is uninformative, describe the image's role on the page instead.
- Never start with "Image of", "Picture of" or "Photo of" — screen readers already announce it as an image.
- No keyword stuffing. Alt text is an accessibility feature first.`,
    user: (a, c) =>
      `Page: ${c.pageUrl}\nPage title: ${c.pageTitle ?? "(unknown)"}\nSite: ${c.siteName}\nImage file: ${a.imageSrc ?? "(unknown)"}\n\nWrite the alt text.`,
    validate: (v) => {
      if (v.length > 125)
        return `The alt text is ${v.length} characters; screen readers cut off around 125.`;
      if (v.length < 5) return "The alt text is too short to describe anything.";
      if (/^(image|picture|photo|graphic) of\b/i.test(v))
        return `Starts with "${v.split(" ").slice(0, 2).join(" ")}" — screen readers already announce it as an image.`;
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

  // Nothing the agent applies is ever empty. Every kind it can execute
  // means "put content here", so an empty value means the drafting step
  // was skipped or returned nothing — and writing it is worse than doing
  // nothing, because the write succeeds, the read-back matches (the
  // field is unchanged), and the action records itself as verified. The
  // user is told the page is fixed and it is not.
  //
  // This is a second line of defence behind requiresDraft(). The first
  // line was a hand-maintained list, and it was wrong for two of the
  // four kinds for as long as they have existed.
  if (opts.newValue.trim() === "") {
    const id = await insert({
      status: "failed",
      error:
        "Nothing was drafted for this change, so there was nothing to write. This is a bug in the agent, not a problem with your site.",
    });
    return {
      status: "failed",
      actionId: id,
      error: "No value to write.",
    };
  }

  const creds = await getClientWpCreds(opts.clientId);
  if (!creds) {
    const id = await insert({
      status: "failed",
      error: "No usable WordPress credentials for this client.",
    });
    return { status: "failed", actionId: id, error: "No WordPress credentials." };
  }

  // Alt text targets an ATTACHMENT, not the page. `expandImageActions`
  // in run.ts has already resolved which one, so there's no URL to look
  // up and no post SEO to read — the whole post-resolution path below
  // would be answering the wrong question.
  //
  // The undo story is clean here: these actions are only created for
  // images whose alt is empty, re-checked at expansion time, so the
  // previous value is "" and undoing writes "" back.
  if (action.kind === "write_image_alt") {
    if (!action.targetRef) {
      const id = await insert({
        status: "failed",
        error: "No attachment id — this action wasn't expanded properly.",
      });
      return { status: "failed", actionId: id, error: "No attachment id." };
    }

    const attachmentId = Number(action.targetRef);
    const write = await setAttachmentAlt(creds, attachmentId, opts.newValue);
    if (!write.ok) {
      const id = await insert({
        status: "failed",
        targetRef: action.targetRef,
        beforeValue: action.currentValue ?? "",
        error: write.error ?? "The CMS rejected the alt text.",
      });
      return { status: "failed", actionId: id, error: write.error };
    }

    const actionId = await insert({
      status: "applied",
      targetRef: action.targetRef,
      beforeValue: action.currentValue ?? "",
      appliedAt: new Date(),
    });

    // Verified by reading the attachment back — the images endpoint
    // reports each one's current alt. Costs a request per image, and is
    // the difference between "we sent it" and "it's there".
    const postId = await findPostIdByUrl(creds, action.targetUrl);
    if (postId !== null) {
      const check = await getPostImages(creds, postId);
      if (check.ok) {
        const image = check.images.find((i) => i.attachmentId === attachmentId);
        if (image && image.alt === opts.newValue) {
          await db
            .update(agentActions)
            .set({
              status: "verified",
              verifiedAt: new Date(),
              verifyNote: "Read back from the media library and confirmed.",
            })
            .where(eq(agentActions.id, actionId));
          return { status: "verified", actionId };
        }
      }
    }

    await db
      .update(agentActions)
      .set({
        verifyNote:
          "Written, but reading it back didn't confirm it. An SEO or media plugin may be managing alt text separately.",
      })
      .where(eq(agentActions.id, actionId));
    return { status: "applied", actionId };
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

  // Some writes can't be read back. `getPostSeo` returns the title and
  // meta description but not the JSON-LD, so a schema write stops at
  // "applied" — and the note says exactly that, rather than the
  // cache-or-plugin explanation below, which would be a guess dressed
  // as a diagnosis.
  if (!isVerifiable(action.kind)) {
    await db
      .update(agentActions)
      .set({
        verifyNote:
          "Written, but not read back — the WordPress bridge doesn't expose this field for reading yet, so we can't confirm it took effect. Check the page if it matters.",
      })
      .where(eq(agentActions.id, actionId));
    return { status: "applied", actionId };
  }

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

  // Alt text branches here too. `targetRef` is an ATTACHMENT id for
  // these actions, so routing it through writeField — which treats
  // targetRef as a post id — would write to whatever post happens to
  // share that number. Undo landing on an unrelated page is worse than
  // no undo, because the user believes it worked.
  const write =
    action.kind === "write_image_alt"
      ? await setAttachmentAlt(
          creds,
          Number(action.targetRef),
          action.beforeValue,
        )
      : await writeField(
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
  // Schema: empty string, not null, and the distinction is load-bearing.
  //
  // `getPostSeo` doesn't return the existing JSON-LD, so we can't read
  // the previous value the way we do for a title. But the ONLY finding
  // that triggers a schema write is `missing_schema` — the page has none
  // by definition — so the previous state is "" and the undo is to write
  // "" back, removing what we added.
  //
  // Returning null instead would trip the "no recorded undo" guard and
  // refuse the write, or worse, record an un-undoable change.
  //
  // This reasoning does NOT extend to `invalid_schema`. If that ever
  // becomes a trigger, the bridge must be able to read the existing
  // markup first, or the agent would silently destroy hand-written
  // structured data with no way back.
  if (kind === "write_schema") return "";
  return null;
}

/** Can we confirm a write took effect by reading the page back? */
function isVerifiable(kind: string): boolean {
  return kind === "write_title" || kind === "write_meta_description";
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
  // wp-bridge has supported this since it was written. The agent claimed
  // the capability (capability detection maps every WP write to the same
  // connection), the planner planned schema work, and then this function
  // refused it — so on any WordPress client with missing schema the agent
  // planned an action that could never succeed. Capability detection
  // exists precisely to stop that, and it was defeated by the executor
  // not implementing what the bridge already did.
  if (kind === "write_schema") return setPostSchema(creds, postId, value);
  // Alt text never reaches here — it has its own branch in executeAction
  // and in revertAction, because it targets an attachment rather than a
  // post and postId would be the wrong id entirely.
  return { ok: false, error: `The agent can't write ${kind} yet.` };
}

export type { AgentAction };
