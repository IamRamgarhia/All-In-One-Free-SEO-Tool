"use client";

import { useState } from "react";

/**
 * Returns a value that changes every time `result` becomes a new
 * non-null object — i.e. every time a server action completes
 * successfully. Feed it to `<RecentRuns refreshKey={...}>` so the run
 * list re-fetches after a save.
 *
 * Replaces this, which was copy-pasted into 18 tool pages:
 *
 *     const [refreshKey, setRefreshKey] = useState(0);
 *     useEffect(() => {
 *       if (state?.ok) setRefreshKey((k) => k + 1);
 *     }, [state]);
 *
 * That version set state from an effect, so every completed action cost
 * an extra render pass: React committed the page, ran the effect, set
 * state, then re-rendered and only then re-fetched. React 19's
 * `set-state-in-effect` lint rule flags it for exactly that reason.
 *
 * This uses the pattern React documents for "adjusting state when a
 * prop changes" — compare against the previous value during render and
 * set state right there. React discards the in-progress render and
 * restarts before touching the DOM, so the extra pass never reaches the
 * browser and no effect is needed.
 *
 * See https://react.dev/learn/you-might-not-need-an-effect
 */
export function useRunRefreshKey(result: unknown): number {
  const [key, setKey] = useState(0);
  const [seen, setSeen] = useState<unknown>(result);

  if (result !== seen) {
    setSeen(result);
    // Only advance on a real result. Without this guard the key would
    // also bump when `result` goes back to null between submissions,
    // re-fetching the list for no reason.
    if (result != null) setKey((k) => k + 1);
  }

  return key;
}
