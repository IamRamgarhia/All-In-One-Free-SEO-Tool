/**
 * What the AI-bot robots audit records for the agent to act on.
 *
 * Split out of the tool's server action because a "use server" module
 * may only export async functions — the build refuses a synchronous
 * export outright. Which is the right pressure: this is pure logic over
 * an audit result, it is the part worth testing, and it now has nothing
 * to do with the request that produced it.
 *
 * The signatures here are the contract with tool-finding-map.ts.
 * Renaming one without updating that map silently disconnects this tool
 * from the agent — tool-finding-map.test.ts fails the build if that
 * happens.
 */

import type { RobotsAudit } from "./ai-bot-robots";

/**
 * The findings this audit produces, or none.
 *
 * Two states are worth recording and a third is not. "Nothing addressed"
 * and "some addressed" are decisions waiting to be made. Fully addressed
 * is not a finding at all — writing a `pass` row would put a green line
 * on the checklist for work nobody has to do, and the loader that feeds
 * the agent filters those out anyway.
 */
export function findingRowsFor(
  audit: Extract<RobotsAudit, { ok: true }>,
  runId: number,
  clientId: number | null,
) {
  const total = audit.bots.length;
  const unaddressed = audit.unaddressedCount;
  if (unaddressed === 0) return [];

  const addressed = total - unaddressed;
  const shared = {
    runId,
    clientId,
    toolId: "ai-robots",
    category: "ai-visibility",
    status: "new" as const,
  };

  // Nothing at all, versus a policy that covers some and not others.
  // They map to different crawler findings and carry different weights,
  // so the distinction has to survive into the signature rather than
  // being flattened into one "AI bots" row.
  if (addressed === 0) {
    return [
      {
        ...shared,
        signature: "ai-robots.unaddressed",
        title: `robots.txt has no policy for any of ${total} AI crawlers`,
        severity: "medium" as const,
        details:
          `None of ${total} known AI crawlers — GPTBot, ClaudeBot, PerplexityBot and the rest — ` +
          `are named in robots.txt, so each one applies its own default. Some read the site, ` +
          `some do not, and nobody chose which.`,
      },
    ];
  }

  return [
    {
      ...shared,
      signature: "ai-robots.partial",
      title: `${unaddressed} of ${total} AI crawlers have no policy`,
      severity: "low" as const,
      details:
        `robots.txt names ${addressed} AI crawler${addressed === 1 ? "" : "s"} and says nothing ` +
        `about the other ${unaddressed}, so those fall back to their own defaults rather than ` +
        `to the policy chosen for the rest.`,
    },
  ];
}
