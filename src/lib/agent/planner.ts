/**
 * Decides what the agent should do for a client today.
 *
 * The planner is deliberately dumb about *judgement* and careful about
 * *eligibility*. It does not ask a model what matters; it takes the
 * findings we already have, filters them down to the ones we can
 * actually act on, removes anything we've touched recently, sorts by how
 * much the fix is worth, and stops at the blast-radius cap.
 *
 * Keeping the LLM out of this loop is the point. An agent that asks a
 * model "what should I change on this website today" gets a plausible
 * answer every single time, including on a site where nothing needs
 * changing — and plausible-but-unnecessary edits to a client's live
 * pages are worse than no edits. The model's job comes later and is
 * narrow: write a better title for THIS page, given it is 102
 * characters and gets truncated. That is a question with a right answer.
 *
 * What counts as "safe" here is not a confidence score. It is whether
 * the problem is defined by a measurable rule:
 *
 *   safe          — the title is 102 characters, which is too long to
 *                   display; the image has no alt text at all
 *   needs_review  — the title is fine but could be more compelling
 *
 * The first can be checked. The second is an opinion, and an opinion
 * applied automatically to forty pages is how you lose a client.
 */

import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, auditIssues, audits, clients } from "@/db/schema";
import type { AgentSettings } from "./autonomy";
import { has, type ClientCapabilities } from "./capabilities";
import { analyseInternalLinks } from "../internal-link-graph";
import { pickAnchor } from "./anchor-text";

export type PlannedAction = {
  kind: PlannableKind;
  targetUrl: string;
  /** Why, in the words the user will read in the run log. */
  reason: string;
  risk: "safe" | "needs_review";
  /** Higher runs first. */
  weight: number;
  /** The audit issue this came from, when it came from one. */
  issueId?: number;
  currentValue?: string | null;
  /**
   * The CMS's own id for the thing being edited, when it isn't the page.
   *
   * Alt text is the reason this exists. A finding says "this page has
   * images with no alt text", but alt text is written per attachment,
   * not per page — so one finding expands into one action per image,
   * each carrying the attachment id it will write to. See
   * `expandImageActions` in run.ts.
   */
  targetRef?: string;
  /** For alt-text actions: the image being described. */
  imageSrc?: string;
  /**
   * For internal-link actions: what to link, and to where.
   *
   * The only payload here that isn't a single string. Links are chosen
   * by the planner rather than drafted later, because the choice is
   * deterministic — an orphan page, the existing page most similar to
   * it, and a phrase that demonstrably appears on that page. There is
   * nothing for a model to decide.
   */
  links?: { anchor: string; url: string }[];
};

export type PlannableKind =
  | "write_title"
  | "write_meta_description"
  | "write_image_alt"
  | "write_schema"
  | "write_internal_links";

/**
 * Audit finding types the agent can actually fix, and what fixing one is
 * worth relative to the others.
 *
 * Weights are ordered by how directly the fix moves something a user
 * cares about, not by how easy it is. A missing meta description costs
 * click-through on a page that already ranks — that is revenue today.
 * Missing schema might do nothing for months.
 */
const FIXABLE: Record<
  string,
  {
    kind: PlannableKind;
    capability: Parameters<typeof has>[1];
    weight: number;
    risk: "safe" | "needs_review";
    reason: string;
  }
> = {
  missing_meta_description: {
    kind: "write_meta_description",
    capability: "write_meta_description",
    weight: 100,
    // Absent is absent. There is no judgement in deciding a page with no
    // description should have one.
    risk: "safe",
    reason:
      "This page has no meta description, so Google writes its own from whatever text it finds. Giving it one is the cheapest click-through win there is.",
  },
  meta_description_too_long: {
    kind: "write_meta_description",
    capability: "write_meta_description",
    weight: 70,
    risk: "safe",
    reason:
      "The description is long enough to get cut off mid-sentence in search results.",
  },
  title_too_long: {
    kind: "write_title",
    capability: "write_title",
    weight: 90,
    risk: "safe",
    reason:
      "The title is too long to display in full, so searchers see it truncated with an ellipsis.",
  },
  title_too_short: {
    kind: "write_title",
    capability: "write_title",
    weight: 60,
    // A short title isn't broken, it's just underusing the space. That's
    // a judgement call about wording, so a human should see it.
    risk: "needs_review",
    reason:
      "The title is much shorter than the space available, which usually means unused room to say what the page is for.",
  },
  missing_title: {
    kind: "write_title",
    capability: "write_title",
    weight: 110,
    risk: "safe",
    reason: "This page has no title tag at all.",
  },
  missing_alt_text: {
    kind: "write_image_alt",
    capability: "write_image_alt",
    weight: 50,
    risk: "safe",
    reason:
      "Images with no alt text are invisible to screen readers and to image search.",
  },
  missing_schema: {
    kind: "write_schema",
    capability: "write_schema",
    weight: 40,
    risk: "needs_review",
    reason:
      "No structured data, so this page can't qualify for rich results. Which schema type fits is a judgement call worth checking.",
  },
};

export type PlanOutcome = {
  actions: PlannedAction[];
  /** Things we could have done but didn't, and why. Shown in the run log. */
  skipped: { reason: string; count: number }[];
};

export async function planForClient(opts: {
  clientId: number;
  capabilities: ClientCapabilities;
  settings: AgentSettings;
  /** Injectable for tests. */
  now?: Date;
}): Promise<PlanOutcome> {
  const now = opts.now ?? new Date();
  const skipped: PlanOutcome["skipped"] = [];
  const note = (reason: string, count: number) => {
    if (count > 0) skipped.push({ reason, count });
  };

  // Most recent completed audit only. Older audits describe a site that
  // may already have been fixed, and acting on a stale finding means
  // editing a page to solve a problem it no longer has.
  const [latestAudit] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(eq(audits.clientId, opts.clientId))
    .orderBy(desc(audits.id))
    .limit(1);

  if (!latestAudit) {
    return {
      actions: [],
      skipped: [{ reason: "No audit has been run for this client yet.", count: 1 }],
    };
  }

  const issues = await db
    .select()
    .from(auditIssues)
    .where(
      and(
        eq(auditIssues.auditId, latestAudit.id),
        eq(auditIssues.status, "new"),
      ),
    );

  // 1. Only findings we know how to fix.
  const candidates: PlannedAction[] = [];
  let notFixable = 0;
  for (const issue of issues) {
    const spec = FIXABLE[issue.type];
    if (!spec) {
      notFixable++;
      continue;
    }
    candidates.push({
      kind: spec.kind,
      targetUrl: issue.url,
      reason: spec.reason,
      risk: spec.risk,
      weight: spec.weight + severityBonus(issue.severity),
      issueId: issue.id,
    });
  }
  note("Findings the agent has no way to fix automatically.", notFixable);

  // 1b. Internal links, which don't come from a finding.
  //
  // Everything above starts with something the audit noticed about one
  // page. An orphan is different: the problem isn't on the orphan at
  // all, it's the absence of a link on some OTHER page, and no
  // per-page check can see that. It needs a view of the whole site.
  //
  // Only run when the capability is actually available — this crawls,
  // and crawling a client's site to plan work that would then be
  // filtered out as un-applyable is pure waste.
  if (has(opts.capabilities, "write_internal_links")) {
    const linkPlan = await planInternalLinks(opts.clientId);
    candidates.push(...linkPlan.actions);
    for (const s of linkPlan.skipped) note(s.reason, s.count);
  }

  // 2. Only what this client's connections actually permit. Planning
  //    work we can't carry out produces a run that looks busy and
  //    changes nothing.
  const capable: PlannedAction[] = [];
  let notCapable = 0;
  for (const a of candidates) {
    if (has(opts.capabilities, a.kind)) capable.push(a);
    else notCapable++;
  }
  note(
    "Fixes we know how to make but can't apply — no CMS connection for this client.",
    notCapable,
  );

  // 3. One action per page+kind. An audit can report the same problem
  //    from several crawl paths, and without this the agent would edit
  //    one page three times in a row.
  const seen = new Set<string>();
  const deduped: PlannedAction[] = [];
  let duplicates = 0;
  for (const a of capable) {
    const key = `${a.kind}::${a.targetUrl}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    deduped.push(a);
  }
  note("Duplicate findings for the same page.", duplicates);

  // 4. Cooldown. Don't re-edit something we touched recently, even if it
  //    still looks improvable — that is how an agent ends up thrashing a
  //    live page with a sequence of individually defensible edits.
  const cooled = await filterCooldown(
    deduped,
    opts.clientId,
    opts.settings.cooldownDays,
    now,
  );
  note(
    `Changed within the last ${opts.settings.cooldownDays} days — left alone to settle.`,
    deduped.length - cooled.length,
  );

  // 5. Daily cap across all runs, then the per-run cap.
  const usedToday = await countActionsSince(
    opts.clientId,
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
  );
  const dailyRemaining = Math.max(0, opts.settings.maxActionsPerDay - usedToday);

  cooled.sort((a, b) => b.weight - a.weight);
  const limit = Math.min(opts.settings.maxActionsPerRun, dailyRemaining);
  const actions = cooled.slice(0, limit);
  note(
    dailyRemaining === 0
      ? `Daily limit of ${opts.settings.maxActionsPerDay} changes already reached.`
      : `Over this run's limit of ${opts.settings.maxActionsPerRun} changes — they'll be picked up next time.`,
    cooled.length - actions.length,
  );

  return { actions, skipped };
}

function severityBonus(severity: string): number {
  if (severity === "critical") return 30;
  if (severity === "high") return 20;
  if (severity === "medium") return 10;
  return 0;
}

/**
 * How much of the site to look at when hunting for orphans.
 *
 * A crawl is the most expensive thing the planner does, and it happens
 * once per run rather than once per action. Sixty pages is enough to
 * find orphans on the small sites this tool is for, and small enough
 * that a run doesn't hammer a client's server.
 */
const LINK_CRAWL_MAX_PAGES = 60;

/** Never propose more than this many link insertions from one run. */
const MAX_LINK_ACTIONS = 3;

/**
 * Find pages nothing links to, and plan a link to each from the most
 * relevant page that already exists.
 *
 * An orphan page is invisible: search engines discover pages by
 * following links, and a page with no inbound links from its own site
 * is telling Google it doesn't matter. Fixing it is a genuine piece of
 * SEO work, and unusually, it's one where the right answer is
 * computable rather than a matter of taste — which is why no model is
 * involved in any part of this.
 *
 * The action targets the SOURCE page, because that's the page being
 * edited. That matters for dedup and cooldown: both key on the page the
 * agent changes, so it won't edit the same article twice in one run or
 * come back to it next week.
 */
async function planInternalLinks(clientId: number): Promise<{
  actions: PlannedAction[];
  skipped: { reason: string; count: number }[];
}> {
  const skipped: { reason: string; count: number }[] = [];
  const actions: PlannedAction[] = [];

  const [client] = await db
    .select({ url: clients.url })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.url) return { actions, skipped };

  let analysis;
  try {
    analysis = await analyseInternalLinks({
      startUrl: client.url,
      maxPages: LINK_CRAWL_MAX_PAGES,
    });
  } catch {
    // A crawl that fails shouldn't take the whole run with it — the
    // finding-driven work above is still perfectly valid.
    return {
      actions,
      skipped: [
        { reason: "Couldn't crawl the site to look for orphan pages.", count: 1 },
      ],
    };
  }

  if (analysis.orphans.length === 0) return { actions, skipped };

  let noSource = 0;
  let noAnchor = 0;

  for (const orphan of analysis.orphans) {
    if (actions.length >= MAX_LINK_ACTIONS) break;

    const suggestion = analysis.suggestions.find(
      (s) => s.orphanUrl === orphan.url,
    );
    const candidates = suggestion?.candidates ?? [];
    if (candidates.length === 0) {
      noSource++;
      continue;
    }

    // Work down the ranked candidates rather than taking only the best.
    //
    // Similarity ranks pages by topic; it has no idea whether a page
    // contains a phrase we can turn into a link. On the first site this
    // ran against, the top match was the homepage — most similar by
    // TF-IDF, and with no usable phrase anywhere on it — while the
    // second was a perfect fit. Giving up after one candidate would
    // have skipped the orphan and reported nothing to do.
    let placed = false;
    for (const source of candidates.slice(0, 3)) {
      // The crawl above already downloaded this page, so its markup
      // comes through with the suggestion rather than being fetched
      // again. Re-fetching would be slower and a second place to get
      // URL handling wrong, for no gain.
      //
      // The anchor has to be words already on the page — see
      // anchor-text.ts for why a model doesn't choose this.
      if (!source.html) continue;
      const choice = pickAnchor(source.html, orphan.title);
      if (!choice) continue;

      actions.push({
        kind: "write_internal_links",
        targetUrl: source.url,
        reason: `Nothing on this site links to "${orphan.title}", so search engines treat it as unimportant and visitors can't find it. This page is the closest match in topic that already contains the phrase "${choice.anchor}" — linking that phrase points readers and crawlers at the orphaned page.`,
        // Editing an article's body is a different risk class from
        // changing a tag, so a human sees it unless autonomy is turned
        // all the way up.
        risk: "needs_review",
        weight: 55,
        links: [{ anchor: choice.anchor, url: orphan.url }],
      });
      placed = true;
      break;
    }

    if (!placed) noAnchor++;
  }

  if (noSource > 0) {
    skipped.push({
      reason:
        "Orphan pages with no related page to link them from — they need a link added by hand, or a new piece of content.",
      count: noSource,
    });
  }
  if (noAnchor > 0) {
    skipped.push({
      reason:
        "Orphan pages whose closest match doesn't contain a phrase worth linking. Forcing a link would mean writing new words into someone's article, which the agent won't do.",
      count: noAnchor,
    });
  }

  return { actions, skipped };
}

async function filterCooldown(
  actions: PlannedAction[],
  clientId: number,
  cooldownDays: number,
  now: Date,
): Promise<PlannedAction[]> {
  if (cooldownDays <= 0 || actions.length === 0) return actions;
  const cutoff = new Date(now.getTime() - cooldownDays * 24 * 60 * 60 * 1000);

  const recent = await db
    .select({
      kind: agentActions.kind,
      targetUrl: agentActions.targetUrl,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, clientId),
        gt(agentActions.createdAt, cutoff),
        // A proposal we never carried out doesn't start a cooldown —
        // nothing changed on the site, so there is nothing to settle.
        inArray(agentActions.status, ["applied", "verified", "queued"]),
      ),
    );

  const blocked = new Set(recent.map((r) => `${r.kind}::${r.targetUrl ?? ""}`));
  return actions.filter((a) => !blocked.has(`${a.kind}::${a.targetUrl}`));
}

async function countActionsSince(clientId: number, since: Date): Promise<number> {
  const rows = await db
    .select({ id: agentActions.id })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, clientId),
        gt(agentActions.createdAt, since),
        inArray(agentActions.status, ["applied", "verified"]),
      ),
    );
  return rows.length;
}

/** Exposed for tests and for the control panel's "what can it fix?" list. */
export const FIXABLE_ISSUE_TYPES = Object.keys(FIXABLE);
export { FIXABLE };
