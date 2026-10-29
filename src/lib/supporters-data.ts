/**
 * Server side of the support tracker: fetch `supporters.json`, and remember
 * the last usable answer.
 *
 * A self-hosted install is often somewhere with no outbound internet, or
 * behind a proxy that blocks raw.githubusercontent.com. The figures are not
 * important enough to show an error about, but they are also not worth
 * blanking a panel over every time the network hiccups — so the last good
 * payload is kept in the settings table and used when a fetch fails. That
 * survives restarts, which browser storage would not.
 *
 * Nothing here throws. The worst outcome is `null`, which renders no tracker
 * at all.
 */

import { getSetting, setSetting } from "./settings-store";
import {
  SUPPORTERS_URL,
  type NudgeState,
  type SupportTracker,
  parseNudgeState,
  parseSupporters,
} from "./supporters";

const CACHE_KEY = "support.tracker_cache";
const NUDGE_KEY = "support.nudge_state";

/**
 * Whether the dashboard card has been put away. A plain read, not a server
 * action — the dashboard renders this, it does not post to it.
 */
export async function getNudgeState(): Promise<NudgeState> {
  try {
    return parseNudgeState(await getSetting(NUDGE_KEY));
  } catch {
    // An unmigrated database means "nothing dismissed yet".
    return {};
  }
}
const TIMEOUT_MS = 6000;

/** How long Next may serve its own cached response before trying again. */
const REVALIDATE_SECONDS = 3600;

export type SupportTrackerResult = {
  tracker: SupportTracker | null;
  /** Whether this came off the network or out of the local cache. */
  source: "network" | "cache" | "none";
};

/**
 * The tracker, preferring a live read and falling back to the last one.
 *
 * The caller is told which it got, because "₹2,500 received" from a cache
 * of unknown age is a different claim from the same figure fetched a moment
 * ago, and this project's second standing rule is that a number shown to a
 * user carries its provenance.
 */
export async function getSupportTracker(): Promise<SupportTrackerResult> {
  const live = await fetchLive();
  if (live) {
    // Store the raw payload, not the parsed object: the parser may get
    // stricter later, and re-parsing on read means the cache gets the new
    // rules for free rather than replaying whatever the old ones allowed.
    try {
      await setSetting(CACHE_KEY, live.raw);
    } catch {
      // A read-only or unmigrated database must not break the page.
    }
    return { tracker: live.tracker, source: "network" };
  }

  try {
    const cached = parseSupporters(await getSetting(CACHE_KEY));
    if (cached) return { tracker: cached, source: "cache" };
  } catch {
    // Same reasoning as above.
  }
  return { tracker: null, source: "none" };
}

async function fetchLive(): Promise<{ tracker: SupportTracker; raw: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SUPPORTERS_URL, {
      signal: controller.signal,
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const tracker = parseSupporters(raw);
    return tracker ? { tracker, raw } : null;
  } catch {
    // Offline, blocked, timed out, or serving something that isn't JSON.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
