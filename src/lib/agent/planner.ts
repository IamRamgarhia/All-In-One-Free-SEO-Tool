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
import { loadActionableToolFindings } from "./tool-finding-map";
import { withoutInfrastructure } from "../infrastructure-urls";
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

/**
 * Kinds whose target is the site, not a page.
 *
 * They dedup on the kind alone and their cooldown is site-wide, because
 * there is only one of the thing being edited no matter how many URLs
 * describe it.
 */
export const SITE_WIDE_KINDS: ReadonlySet<string> = new Set([
  "write_robots_txt",
  "write_hardening",
  "write_redirects",
]);

/**
 * Which hardening toggle each WordPress finding turns on.
 *
 * Six findings, six switches, one per problem. Kept as a map rather than
 * six near-identical FIXABLE entries carrying the key in prose, because
 * the executor has to read the key back and a typo in a string literal
 * would silently toggle nothing while reporting success.
 *
 * Every key here must exist in HARDENING_KEYS — hardening-map.test.ts
 * fails if one does not.
 */
export const HARDENING_FOR_FINDING: Record<string, string> = {
  wp_xmlrpc_exposed: "disable_xmlrpc",
  wp_version_disclosed: "hide_wp_version",
  wp_rest_api_advertised: "hide_rest_discovery",
  wp_emoji_bloat: "disable_emoji",
  wp_heartbeat_on_frontend: "disable_heartbeat_frontend",
  wp_author_archive_indexed: "noindex_author_archives",
};

export type PlannableKind =
  | "write_title"
  | "write_meta_description"
  | "write_image_alt"
  | "write_schema"
  | "write_internal_links"
  | "write_social_meta"
  // Per-page metadata, plugin 0.5.0 and up.
  | "write_canonical"
  | "write_robots_meta"
  // Site-wide, plugin 0.5.0 and up. Not a page edit — the target is the
  // site itself, which is why the executor handles it separately and the
  // risk is always needs_review.
  | "write_robots_txt"
  // Site-wide, plugin 0.5.0 and up. Each carries the specific thing it
  // changes in targetRef — the toggle key, or the 404 being redirected —
  // because the site is the target and the kind alone does not say what
  // about it is changing.
  | "write_hardening"
  | "write_redirects";

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
  long_meta_description: {
    kind: "write_meta_description",
    capability: "write_meta_description",
    weight: 70,
    risk: "safe",
    reason:
      "The description is long enough to get cut off mid-sentence in search results.",
  },
  long_title: {
    kind: "write_title",
    capability: "write_title",
    weight: 90,
    risk: "safe",
    reason:
      "The title is too long to display in full, so searchers see it truncated with an ellipsis.",
  },
  short_title: {
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
  missing_image_alt: {
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

  // ---- Metadata that duplicates or under-uses the space -------------
  //
  // These reuse the title and description writers unchanged. They were
  // simply never listed, so the crawler flagged them and the agent had
  // no entry for them — detected, never actionable.

  duplicate_title: {
    kind: "write_title",
    capability: "write_title",
    weight: 85,
    // Which of the two pages should keep the title is a judgement about
    // what each page is for, and the agent cannot see that.
    risk: "needs_review",
    reason:
      "Another page on the site uses this exact title, so Google has to guess which one to show for it — and often shows neither.",
  },
  duplicate_meta_description: {
    kind: "write_meta_description",
    capability: "write_meta_description",
    weight: 55,
    risk: "needs_review",
    reason:
      "This description is copied on another page. Identical descriptions give searchers no reason to pick one result over the other.",
  },
  short_meta_description: {
    kind: "write_meta_description",
    capability: "write_meta_description",
    weight: 45,
    risk: "needs_review",
    reason:
      "The description is much shorter than the space search results allow, which is unused room to say why this page answers the question.",
  },

  // ---- Canonical tags ------------------------------------------------

  missing_canonical: {
    kind: "write_canonical",
    capability: "write_canonical",
    weight: 75,
    // A page with no canonical at all gets a self-referencing one. There
    // is no judgement in pointing a page at itself.
    risk: "safe",
    reason:
      "This page doesn't say which address is the real one, so if it's reachable at more than one URL, Google picks for you.",
  },
  non_self_canonical: {
    kind: "write_canonical",
    capability: "write_canonical",
    weight: 95,
    // Pointing elsewhere is sometimes deliberate — syndicated content,
    // deliberate consolidation. Changing it without looking can hand a
    // page's rankings to a page that shouldn't have them.
    risk: "needs_review",
    reason:
      "This page's canonical points at a different URL, which tells Google to rank that one instead. Sometimes deliberate, often a template mistake.",
  },
  invalid_canonical: {
    kind: "write_canonical",
    capability: "write_canonical",
    weight: 100,
    // Not "safe", even though a broken canonical is unambiguously wrong.
    // The contract test refuses a safe flag on anything that isn't an
    // absence or a measured limit, and it is right to: a malformed
    // canonical can be a templating bug the owner wants to see, and
    // apply_safe would rewrite it on a live site without asking.
    risk: "needs_review",
    reason:
      "The canonical tag isn't a usable URL, so Google ignores it and the page is left with no canonical at all.",
  },
  canonical_chain: {
    kind: "write_canonical",
    capability: "write_canonical",
    weight: 80,
    risk: "needs_review",
    reason:
      "The canonical points at a page that then points somewhere else. Google follows one hop, so the intended destination is never reached.",
  },

  // ---- Indexing directives -------------------------------------------
  //
  // Both are needs_review without exception. A noindex is occasionally
  // deliberate — a thank-you page, a staging route left public — and
  // removing one the owner meant to keep is how a private page ends up
  // in search results.

  noindex_set: {
    kind: "write_robots_meta",
    capability: "write_robots_meta",
    weight: 120,
    risk: "needs_review",
    reason:
      "This page tells Google not to index it, so it cannot appear in search at all. Worth confirming that's intended.",
  },
  xrobots_noindex: {
    kind: "write_robots_meta",
    capability: "write_robots_meta",
    weight: 120,
    risk: "needs_review",
    reason:
      "The server sends an X-Robots-Tag noindex header for this page, which keeps it out of search regardless of what the page itself says.",
  },

  // ---- robots.txt ----------------------------------------------------
  //
  // Site-wide, so needs_review without exception. One wrong Disallow line
  // takes a whole site out of Google, and unlike a page edit there is no
  // partial blast radius to limit it.

  // ---- Social previews ------------------------------------------------
  //
  // Both are `safe`: the page has no Open Graph or Twitter tags at all,
  // so there is nothing to overwrite and no judgement about whether the
  // existing wording was better. Adding an absent tag cannot be worse
  // than the platform scraping the navigation for a title, which is what
  // it does now.
  //
  // Deliberately low weight. A share card nobody has shared yet is worth
  // less than a title Google is already showing, and this list is
  // ordered by what changes most per minute spent.
  missing_og_tags: {
    kind: "write_social_meta",
    capability: "write_social_meta",
    weight: 30,
    risk: "safe",
    reason:
      "This page has no Open Graph tags, so anyone sharing it gets whatever text the platform scrapes — usually the navigation menu rather than the page.",
  },
  missing_twitter_card: {
    kind: "write_social_meta",
    capability: "write_social_meta",
    weight: 20,
    risk: "safe",
    reason:
      "No Twitter card tags. X falls back to Open Graph, so this is the smaller half of the same job — worth doing while the page is open.",
  },

  missing_robots_txt: {
    kind: "write_robots_txt",
    capability: "write_robots_txt",
    weight: 80,
    // Still needs_review despite being an absence rather than a
    // judgement. Everything that writes robots.txt is, because one wrong
    // Disallow takes a whole site out of Google and there is no partial
    // blast radius to limit it.
    risk: "needs_review",
    reason:
      "This site serves no robots.txt at all. Crawlers cope, but nothing points them at the sitemap and there is nowhere to say anything when you need to.",
  },
  // invalid_robots_txt is deliberately NOT here. "Invalid" means lines
  // that do not parse, and repairing those requires knowing what the
  // author meant — a Disallow with a typo could be protecting something.
  // Guessing would be the one mistake in this file that can deindex a
  // site, so it stays a finding a person reads.

  missing_ai_crawler_policy: {
    kind: "write_robots_txt",
    capability: "write_robots_txt",
    weight: 65,
    risk: "needs_review",
    reason:
      "robots.txt says nothing about AI crawlers, so each of them applies its own default — some read the site, some don't, and nobody decided which. Saying so explicitly is the decision, whichever way it goes.",
  },
  partial_ai_crawler_policy: {
    kind: "write_robots_txt",
    capability: "write_robots_txt",
    weight: 35,
    risk: "needs_review",
    reason:
      "robots.txt names some AI crawlers and not others, so the ones left out fall back to their own defaults rather than the policy that was chosen for the rest.",
  },

  // --- WordPress hardening -------------------------------------------
  //
  // Every one is needs_review, at every autonomy level. These change how
  // the whole site behaves rather than what one page says, and each has
  // a real if uncommon way to be wrong: a site whose app genuinely calls
  // XML-RPC, a theme that depends on the emoji script, an author archive
  // somebody ranks on deliberately. The cost of asking is one click; the
  // cost of not asking is a site that quietly stopped doing something.
  wp_xmlrpc_exposed: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 45,
    risk: "needs_review",
    reason:
      "XML-RPC is advertised on this site. It is the endpoint brute-force tools target first, and almost nothing modern uses it — but the Jetpack and WordPress mobile apps do, so this is worth a look before switching it off.",
  },
  wp_version_disclosed: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 30,
    risk: "needs_review",
    reason:
      "The exact WordPress version is published in the page source, which tells anyone scanning precisely which known vulnerabilities to try.",
  },
  wp_rest_api_advertised: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 25,
    risk: "needs_review",
    reason:
      "The REST API is linked from every page, which enumerates users and content to anyone who follows it. Hiding the link does not disable the API — anything of yours that uses it keeps working.",
  },
  wp_emoji_bloat: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 35,
    risk: "needs_review",
    reason:
      "WordPress loads an emoji script on every page to support browsers that have not needed it in years. It is pure weight on Core Web Vitals.",
  },
  wp_heartbeat_on_frontend: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 30,
    risk: "needs_review",
    reason:
      "The admin heartbeat is polling on public pages, so every visitor's browser makes a request every fifteen seconds for a feature only logged-in editors use.",
  },
  wp_author_archive_indexed: {
    kind: "write_hardening",
    capability: "write_hardening",
    weight: 40,
    risk: "needs_review",
    reason:
      "Author archives are indexable. On a one-author site they duplicate the blog index exactly, so the two compete for the same searches — but on a site with named expert contributors they can be worth ranking, which is why this asks first.",
  },

  // --- Redirects -----------------------------------------------------
  //
  // Always needs_review, at every autonomy level, for a reason worth
  // stating plainly: a wrong redirect takes traffic off a page and sends
  // it somewhere else, and the symptom is a page that quietly stops
  // earning rather than an error anyone sees.
  broken_link: {
    kind: "write_redirects",
    capability: "write_redirects",
    weight: 55,
    risk: "needs_review",
    reason:
      "A link on this site points at a URL that returns 404. A redirect sends the people and the link equity somewhere useful instead of into a dead end.",
  },
  redirect_chain: {
    kind: "write_redirects",
    capability: "write_redirects",
    weight: 40,
    risk: "needs_review",
    reason:
      "This URL redirects to a URL that redirects again. Each hop costs time and loses a little of what the link passes on, and pointing the first one straight at the destination removes both.",
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
  // The latest COMPLETED CRAWL, not the latest row in the table.
  //
  // Two things were wrong with taking whatever came last. A crawl that
  // failed or is still running counts as an audit, so the agent would
  // read a half-finished one and plan nothing. And the AI site audit
  // writes into this same table with kind "ai_full" — a different
  // vocabulary of its own check ids, none of which the planner can fix.
  // So running an AI audit made the agent stop finding work entirely:
  // it read 27 AI rows, matched none of them against FIXABLE, and
  // reported that there was nothing to do while a crawl with 134
  // findings sat one row above it.
  const [latestAudit] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(
      and(
        eq(audits.clientId, opts.clientId),
        eq(audits.status, "completed"),
        eq(audits.kind, "crawler"),
      ),
    )
    .orderBy(desc(audits.id))
    .limit(1);

  if (!latestAudit) {
    return {
      actions: [],
      skipped: [{ reason: "No audit has been run for this client yet.", count: 1 }],
    };
  }

  // Infrastructure rows out. The planner writes to live sites, and an old
  // audit's /cdn-cgi/ finding would have it drafting a meta description
  // for a Cloudflare redirect that no CMS has a post for.
  const issues = withoutInfrastructure(
    await db
      .select()
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, latestAudit.id),
          eq(auditIssues.status, "new"),
        ),
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
      // Site-wide kinds need to say WHICH site-wide thing they change.
      // Without it six hardening findings dedup down to one and the
      // executor has no switch to flip.
      ...siteWideTarget(issue.type, issue.url),
    });
  }
  note("Findings the agent has no way to fix automatically.", notFixable);

  // 1a. The same, from tools rather than the crawler.
  //
  // The tools produce findings into their own table and, until now, the
  // agent had never read one — so a tool could detect a problem the
  // agent already knew how to fix and the two never met. See
  // tool-finding-map.ts for why the mapping goes onto the crawler's
  // vocabulary rather than beside it.
  //
  // Deliberately after the audit findings and before dedup: an audit
  // finding and a tool finding for the same page and the same problem
  // collapse to one action at step 3, and the audit's copy wins because
  // it is already in the list.
  let fromTools = 0;
  try {
    const toolFound = await loadActionableToolFindings({
      clientId: opts.clientId,
      now,
    });
    for (const f of toolFound) {
      const spec = FIXABLE[f.type];
      if (!spec) continue;
      // Without a URL there is nothing for a per-page action to target.
      // Site-wide kinds ignore targetUrl, but they still carry one so
      // the dedup key and the run log have something to show.
      if (!f.url) continue;
      candidates.push({
        kind: spec.kind,
        targetUrl: f.url,
        // Says where it came from. A user reading the run log should be
        // able to tell a crawl finding from a tool's, because they can
        // disagree and the tool is usually the more specific of the two.
        reason: `${spec.reason} (found by the ${f.toolId} tool)`,
        risk: spec.risk,
        weight: spec.weight + severityBonus(f.severity),
        ...siteWideTarget(f.type, f.url),
      });
      fromTools++;
    }
  } catch {
    // A broken tool-findings read must not take the whole run down —
    // the crawler findings above are the primary source and still stand.
    fromTools = 0;
  }
  void fromTools;

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
  //
  //    Site-wide kinds key on the kind alone. There is one robots.txt
  //    however many URLs point at it, and the crawler and the ai-robots
  //    tool describe it with different ones — the crawl says
  //    "https://site/robots.txt", the tool says "https://site/". Keying
  //    on the URL let both through, so the agent planned the same
  //    site-wide edit twice and burned two of its per-run slots to
  //    apply it once.
  const seen = new Set<string>();
  const deduped: PlannedAction[] = [];
  let duplicates = 0;
  for (const a of capable) {
    const key = SITE_WIDE_KINDS.has(a.kind)
      ? // targetRef distinguishes one site-wide change from another.
        // robots.txt has none — there is one file — but six hardening
        // toggles share a kind and a site URL, and keying on either
        // alone would apply one and silently drop the other five.
        a.targetRef
        ? `${a.kind}::${a.targetRef}`
        : a.kind
      : `${a.kind}::${a.targetUrl}`;
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

/**
 * What a site-wide action actually changes, when the kind alone does not
 * say.
 *
 * A per-page action is identified by its URL. A site-wide one is not —
 * every hardening finding on a site shares the same target, and six of
 * them share the same kind. targetRef is what tells them apart, through
 * dedup, through the cooldown, and in the executor which reads the
 * switch back out of it.
 *
 * Redirects additionally carry where to send the 404, which is computed
 * here rather than drafted: the destination is the site's home page
 * unless something better is known, and "somewhere on this site" beats
 * a dead end while still being obvious enough that a person reviewing
 * it will correct it if it is wrong. Every redirect is needs_review, so
 * one always does.
 */
function siteWideTarget(
  findingType: string,
  url: string,
): Pick<PlannedAction, "targetRef" | "currentValue"> {
  const toggle = HARDENING_FOR_FINDING[findingType];
  if (toggle) return { targetRef: `site:hardening:${toggle}` };

  // robots.txt findings share a kind and need different content written,
  // so the drafter is told which one this is. Without it, "create the
  // missing file" and "add an AI policy" are indistinguishable by the
  // time they reach draftValue, and dedup would collapse them into one.
  if (findingType === "missing_robots_txt") {
    return { targetRef: "site:robots_txt:create" };
  }
  if (
    findingType === "missing_ai_crawler_policy" ||
    findingType === "partial_ai_crawler_policy"
  ) {
    return { targetRef: "site:robots_txt:ai_policy" };
  }

  if (findingType === "broken_link" || findingType === "redirect_chain") {
    let from = url;
    let home = "/";
    try {
      const u = new URL(url);
      from = u.pathname + u.search;
      home = u.origin + "/";
    } catch {
      /* a relative URL is already a path */
    }
    return {
      targetRef: `site:redirect:${from}`,
      currentValue: JSON.stringify({ from, to: home, code: 301 }),
    };
  }

  return {};
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
      // Site-wide actions share a target URL, so without this one
      // hardening toggle applied on Monday would put the other five on
      // cooldown until Thursday.
      targetRef: agentActions.targetRef,
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

  const key = (kind: string, url: string | null, ref: string | null | undefined) =>
    ref ? `${kind}::${ref}` : `${kind}::${url ?? ""}`;
  const blocked = new Set(
    recent.map((r) => key(r.kind, r.targetUrl, r.targetRef)),
  );
  return actions.filter(
    (a) => !blocked.has(key(a.kind, a.targetUrl, a.targetRef)),
  );
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
