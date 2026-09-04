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
import { AI_BOTS } from "../ai-bot-robots";
import { getRobotsTxt, setRobotsTxt } from "../wp-bridge";
import { db } from "@/db/client";
import { agentActions, type AgentAction } from "@/db/schema";
import {
  findPostIdByUrl,
  getClientWpCreds,
  getPostImages,
  getPostSeo,
  insertInternalLinks,
  setAttachmentAlt,
  setPostSchema,
  setPostSeo,
  undoRevision,
  type WpCreds,
} from "../wp-bridge";
import { callAIResult } from "../ai-call";
import { guardedFetch } from "../url-guard";
import type { PlannedAction } from "./planner";

export type ExecuteOutcome = {
  /**
   * "skipped" means we looked, and there was correctly nothing to do —
   * the phrase was already linked, someone got there first. It is not a
   * failure, and counting it as one would teach users to ignore the
   * agent's failures, which is the last thing a tool that edits live
   * sites can afford.
   */
  status: "verified" | "applied" | "failed" | "queued" | "proposed" | "skipped";
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
  return (
    kind === "write_schema" ||
    kind === "write_internal_links" ||
    // Deterministic, but still drafted. "Requires a draft" means "must
    // not be executed with an empty string" — it does not mean "must ask
    // a model". Leaving these out would send "" to the site, verify
    // cleanly against a field that never changed, and report the page as
    // fixed. That exact sequence already shipped for alt text.
    kind === "write_canonical" ||
    kind === "write_robots_meta" ||
    kind === "write_robots_txt" ||
    kind in DRAFT_SPECS
  );
}

export async function draftValue(
  action: PlannedAction,
  context: { siteName: string; pageTitle?: string | null; pageUrl: string },
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  // robots.txt: the block of directives that must be present.
  //
  // Not the whole file — the executor merges this into whatever the site
  // already serves, because replacing robots.txt wholesale would throw
  // away Disallow rules somebody added on purpose and the agent has no
  // way to know were deliberate.
  //
  // Allow, not Disallow. The finding is "nobody decided", and the agent
  // must not decide to block AI crawlers on a user's behalf — that is a
  // business decision with revenue attached, and it is far easier to
  // flip a written Allow to Disallow than to notice a silent one.
  if (action.kind === "write_robots_txt") {
    const lines = [
      "# AI crawler policy — added by SEO Tool. Change Allow to Disallow",
      "# for any of these you would rather keep out.",
      ...AI_BOTS.flatMap((b) => [`User-agent: ${b.ua}`, "Allow: /", ""]),
    ];
    return { ok: true, value: lines.join("\n").trimEnd() + "\n" };
  }

  // A canonical is the page's own address. There is no wording to
  // choose and nothing for a model to get wrong, so this is computed —
  // and computed from the URL the crawler actually fetched, not
  // reconstructed, so it matches what the site serves.
  if (action.kind === "write_canonical") {
    const url = (action.targetUrl ?? "").trim();
    if (!url) {
      return {
        ok: false,
        error:
          "No page URL to point the canonical at. Writing an empty canonical would remove the tag rather than fix it.",
      };
    }
    try {
      // Normalised so a trailing-slash difference between the crawl and
      // the site's own permalink doesn't read as a mismatch forever.
      const u = new URL(url);
      u.hash = "";
      return { ok: true, value: u.toString() };
    } catch {
      return { ok: false, error: `"${url}" isn't a valid URL to canonicalise to.` };
    }
  }

  // Removing a noindex means saying the opposite explicitly rather than
  // deleting the directive: an absent robots meta inherits whatever the
  // SEO plugin's site-wide default is, which on some setups is the
  // noindex we are trying to remove.
  if (action.kind === "write_robots_meta") {
    return { ok: true, value: "index,follow" };
  }

  // Internal links are decided by the planner, not written by a model.
  // The orphan page, the page to link it from, and the anchor phrase
  // are all computable — see anchor-text.ts. Drafting here is just
  // carrying that decision through the pipeline in the shape the
  // executor expects, and refusing if it somehow arrived empty.
  if (action.kind === "write_internal_links") {
    const links = action.links ?? [];
    if (links.length === 0) {
      return {
        ok: false,
        error: "No links were chosen for this page, so there is nothing to insert.",
      };
    }
    return { ok: true, value: JSON.stringify(links) };
  }

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

  // robots.txt is site-wide, so it never resolves a post id.
  //
  // It reads what the site serves, merges the drafted block in, and
  // writes the result — rather than replacing the file. Anything already
  // there was put there by somebody, and this has no way to tell a
  // deliberate Disallow from an accidental one.
  if (action.kind === "write_robots_txt") {
    const current = await getRobotsTxt(creds);
    if (!current.ok) {
      const id = await insert({ status: "failed", error: current.error });
      return { status: "failed", actionId: id, error: current.error };
    }

    // A real file on disk beats every plugin. Saying so is the whole
    // point — writing anyway would report a success the user could only
    // disprove by loading the URL.
    if (current.data.physicalFile) {
      const why =
        "This site serves a real robots.txt file from disk, which WordPress uses instead of anything a plugin provides. Edit that file directly.";
      const id = await insert({ status: "skipped", error: why });
      return { status: "skipped", actionId: id };
    }

    const existing = current.data.served;
    const merged = mergeRobotsBlock(existing, opts.newValue);
    if (merged === existing) {
      const id = await insert({
        status: "skipped",
        beforeValue: existing,
        error:
          "Every one of these directives is already in robots.txt, so nothing needed changing.",
      });
      return { status: "skipped", actionId: id };
    }

    const res = await setRobotsTxt(creds, merged);
    if (!res.ok) {
      const id = await insert({
        status: "failed",
        beforeValue: existing,
        error: res.error,
      });
      return { status: "failed", actionId: id, error: res.error ?? "Write failed." };
    }

    const actionId = await insert({
      status: "applied",
      targetRef: "site:robots_txt",
      beforeValue: existing,
      afterValue: merged,
      appliedAt: new Date(),
    });

    // Read it back. The write returning ok only means the request was
    // accepted; this is what proves the site changed.
    const after = await getRobotsTxt(creds);
    if (after.ok && after.data.served === merged) {
      await db
        .update(agentActions)
        .set({ status: "verified", verifiedAt: new Date() })
        .where(eq(agentActions.id, actionId));
      return { status: "verified", actionId };
    }
    return { status: "applied", actionId };
  }

  // Internal links edit the article BODY, which makes them the only
  // action here whose undo can't replay a saved value — the value is
  // the whole post. WordPress already keeps it, so we store its
  // revision id and hand undo back to the CMS. See `cmsRevisionId` in
  // the schema and `undoRevision` in wp-bridge.
  if (action.kind === "write_internal_links") {
    let links: { anchor: string; url: string }[];
    try {
      links = JSON.parse(opts.newValue);
    } catch {
      const id = await insert({
        status: "failed",
        error: "The links for this page couldn't be read back. This is a bug in the agent.",
      });
      return { status: "failed", actionId: id, error: "Malformed links payload." };
    }

    const postId = await findPostIdByUrl(creds, action.targetUrl);
    if (postId === null) {
      const id = await insert({
        status: "failed",
        error: "Couldn't find this page in WordPress, so there was nothing to edit.",
      });
      return { status: "failed", actionId: id, error: "Page not found in the CMS." };
    }

    const res = await insertInternalLinks(creds, postId, links);
    if (!res.ok) {
      const id = await insert({
        status: "failed",
        targetRef: String(postId),
        error: res.error,
      });
      return { status: "failed", actionId: id, error: res.error };
    }

    // Nothing changed, and that is a normal answer rather than a
    // failure. The usual cause is the phrase already being linked —
    // someone got there first, by hand or in an earlier run. Recording
    // it as "failed" would teach users to ignore the agent's failures,
    // which is the last thing a tool that edits live sites wants.
    if (!res.changed) {
      const why = res.skipped[0]?.reason ?? "the phrase wasn't found in the page's visible text";
      const id = await insert({
        status: "skipped",
        targetRef: String(postId),
        error: `No link was added — ${why}. The page was left exactly as it was.`,
      });
      return { status: "skipped", actionId: id };
    }

    const actionId = await insert({
      status: "applied",
      targetRef: String(postId),
      cmsRevisionId: res.revId ?? null,
      appliedAt: new Date(),
    });

    // Verify from the published page, not from the API's own answer.
    // The plugin reporting "inserted" only means it wrote to the
    // database; a caching layer or a theme that rebuilds content can
    // still mean visitors never see it.
    const anchor = res.inserted[0]?.anchor ?? links[0].anchor;
    const target = res.inserted[0]?.url ?? links[0].url;
    const live = await linkIsLive(action.targetUrl, anchor, target);
    if (live) {
      await db
        .update(agentActions)
        .set({
          status: "verified",
          verifiedAt: new Date(),
          verifyNote: `Loaded the page and found "${anchor}" linking to ${target}.`,
        })
        .where(eq(agentActions.id, actionId));
      return { status: "verified", actionId };
    }

    await db
      .update(agentActions)
      .set({
        verifyNote:
          "WordPress accepted the link, but loading the page didn't show it. A caching plugin or CDN may still be serving the old version.",
      })
      .where(eq(agentActions.id, actionId));
    return { status: "applied", actionId };
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
/**
 * Load the published page and check the link is really there.
 *
 * "The API said ok" and "a visitor can see it" are different claims, and
 * the whole reason actions have a `verified` status distinct from
 * `applied` is that this codebase keeps finding places where the first
 * was reported as the second.
 *
 * Matches the anchor inside an <a> pointing at the target, tolerating
 * the relative/absolute mismatch that WordPress introduces — we send
 * "/shop/soap" and the rendered page may show the full URL.
 */
async function linkIsLive(
  pageUrl: string,
  anchor: string,
  target: string,
): Promise<boolean> {
  try {
    // guardedFetch refuses private addresses, which is right for a URL
    // a stranger supplied to the public grader and wrong for a page on
    // the client's own site that this tool just crawled. The same
    // documented opt-in that lets a self-hoster connect to WordPress in
    // their compose stack lets us read the page back afterwards —
    // otherwise every write to a LAN site would report "we couldn't
    // confirm it", which is worse than useless: it's a warning about
    // nothing, on every single change.
    const res =
      process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT === "1"
        ? await fetch(pageUrl, { redirect: "follow" })
        : await guardedFetch(pageUrl, { redirect: "follow" });
    if (!res.ok) return false;
    const html = (await res.text()).slice(0, 400_000);

    let path = target;
    try {
      path = new URL(target, pageUrl).pathname;
    } catch {
      // Relative already, or unparseable — compare as given.
    }

    const anchorPattern = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<a[^>]+href=["'][^"']*${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"']*["'][^>]*>[^<]*${anchorPattern}`,
      "i",
    );
    return re.test(html);
  } catch {
    return false;
  }
}

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
  const creds = await getClientWpCreds(action.clientId);
  if (!creds) return { ok: false, error: "No usable WordPress credentials." };

  // Internal links are undone by the CMS, not by us. The previous value
  // is the whole article body, which WordPress already stored when it
  // made the change — so `beforeValue` is deliberately null here and
  // the checks below would reject a perfectly undoable action.
  if (action.kind === "write_internal_links") {
    if (action.cmsRevisionId === null) {
      return {
        ok: false,
        error:
          "No WordPress revision was recorded for this change, so it can't be undone automatically. You can restore the page from its WordPress revision history.",
      };
    }
    const undone = await undoRevision(creds, action.cmsRevisionId);
    if (!undone.ok) return { ok: false, error: undone.error };

    await db
      .update(agentActions)
      .set({ status: "reverted", revertedAt: new Date() })
      .where(eq(agentActions.id, actionId));
    return { ok: true };
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
  seo: {
    title: string;
    metaDescription: string;
    canonical?: string | null;
    robots?: string | null;
  },
  kind: string,
): string | null {
  if (kind === "write_title") return seo.title ?? null;
  if (kind === "write_meta_description") return seo.metaDescription ?? null;
  // Null here means the plugin did not report the field — an install
  // older than 0.5.0 omits both keys. That is deliberately NOT coerced
  // to "": the caller treats null as "no recorded undo" and refuses the
  // write, which is the right answer. Reading a missing key as "this
  // page has no canonical" would invite writing one onto every page on
  // the site, with nothing to restore.
  if (kind === "write_canonical") return seo.canonical ?? null;
  if (kind === "write_robots_meta") return seo.robots ?? null;
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
  // Canonical and robots join the list because plugin 0.5.0 returns both
  // from GET /post/{id}/seo. Verification is the difference between
  // "we sent it" and "the site changed" — the two came apart once
  // already, when the client sent metaDescription and the plugin read
  // meta_description and answered ok to a write that did nothing.
  return (
    kind === "write_title" ||
    kind === "write_meta_description" ||
    kind === "write_canonical" ||
    kind === "write_robots_meta"
  );
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
  if (kind === "write_canonical")
    return setPostSeo(creds, postId, { canonical: value });
  if (kind === "write_robots_meta")
    return setPostSeo(creds, postId, { robots: value });
  // Alt text never reaches here — it has its own branch in executeAction
  // and in revertAction, because it targets an attachment rather than a
  // post and postId would be the wrong id entirely.
  return { ok: false, error: `The agent can't write ${kind} yet.` };
}

export type { AgentAction };

/**
 * Check a value someone else wrote against the rules we'd apply to our
 * own drafts.
 *
 * Exists for the MCP path, where the text comes from the user's own
 * Claude or ChatGPT rather than from a model we called. The words change
 * origin; the standards must not. A 95-character title is refused
 * whoever produced it.
 *
 * Deliberately reuses DRAFT_SPECS rather than restating the limits. Four
 * separate copies of the finding-type names drifted in this codebase and
 * every one of them broke something silently — a second copy of the
 * length rules would go the same way, and the symptom would be the agent
 * accepting copy it should have rejected.
 */
export function validateDraftedValue(
  kind: string,
  value: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const cleaned = cleanDraft(value);
  if (!cleaned) {
    return { ok: false, error: "Empty after trimming — there is nothing to write." };
  }

  // Schema is JSON, not prose, so the prompt-table rules don't apply.
  // It gets the same structural check draftSchema performs.
  if (kind === "write_schema") {
    try {
      const parsed = JSON.parse(cleaned);
      if (!parsed || typeof parsed !== "object") throw new Error("not an object");
      const r = parsed as Record<string, unknown>;
      if (!r["@context"] || !r["@type"]) {
        return { ok: false, error: "Schema is missing @context or @type." };
      }
    } catch {
      return {
        ok: false,
        error:
          "That isn't valid JSON. Refusing to write it — broken JSON-LD is worse than none, because the page looks marked up and isn't.",
      };
    }
    return { ok: true, value: cleaned };
  }

  const spec = DRAFT_SPECS[kind];
  if (!spec) return { ok: false, error: `No validation rules for ${kind}.` };

  const problem = spec.validate(cleaned);
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: cleaned };
}

/** The rules, as text, so a client's model can meet them first time. */
export function draftRulesFor(kind: string): string | null {
  if (kind === "write_schema") {
    return "Valid JSON-LD as a single JSON object, including @context and @type. Do not invent facts, prices, ratings or authors that aren't demonstrably on the page.";
  }
  return DRAFT_SPECS[kind]?.system ?? null;
}

/**
 * Does this kind need an actual language model, or just a value?
 *
 * Not the same question as `requiresDraft`, and conflating them cost
 * something real: internal links need a VALUE (the anchor and target)
 * but no model — the planner computes both from an orphan page and a
 * phrase that demonstrably appears on the linking page. Treating them as
 * model-dependent meant that on an install with no API key they were
 * parked awaiting text a caller would have had to invent, when they
 * could have been applied immediately and correctly.
 *
 * requiresDraft: "must not be executed with an empty value" — all kinds.
 * requiresModel: "somebody has to write prose" — all but links.
 */
export function requiresModel(kind: string): boolean {
  return requiresDraft(kind) && kind !== "write_internal_links";
}

/**
 * Add a block of robots.txt directives without disturbing what's there.
 *
 * Merge rather than replace, and it matters: robots.txt is one file for
 * a whole site, and anything already in it was put there by somebody.
 * Replacing it wholesale would silently drop a Disallow that was
 * protecting a staging path or an admin area, and the agent has no way
 * to tell a deliberate rule from an accidental one.
 *
 * A user-agent already named in the file is left completely alone —
 * including its existing directives — because a policy someone has
 * already stated is a decision, not a gap. Only the ones the file says
 * nothing about get appended.
 */
export function mergeRobotsBlock(existing: string, block: string): string {
  const names = (text: string) =>
    new Set(
      [...text.matchAll(/^\s*User-agent:\s*(.+?)\s*$/gim)].map((m) =>
        m[1].toLowerCase(),
      ),
    );

  const already = names(existing);

  // Walk the block in "User-agent: X" + following directives groups, and
  // keep only the groups for agents the file has never heard of.
  const lines = block.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const ua = line.match(/^\s*User-agent:\s*(.+?)\s*$/i);
    if (ua) {
      skipping = already.has(ua[1].toLowerCase());
      if (!skipping) kept.push(line);
      continue;
    }
    // Comments before the first User-agent belong to the block header.
    if (!skipping) kept.push(line);
  }

  const addition = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Nothing new to say. Returning `existing` unchanged is what lets the
  // caller record "skipped" rather than writing an identical file and
  // reporting it as a fix.
  if (!/^\s*User-agent:/im.test(addition)) return existing;

  const base = existing.trimEnd();
  return (base ? base + "\n\n" : "") + addition + "\n";
}
