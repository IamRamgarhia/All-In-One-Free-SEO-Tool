/**
 * The trial's client-safe surface: its size and its result shape.
 *
 * Split out because the autonomy prompt is a client component, and
 * importing `TRIAL_SIZE` from trial.ts pulled that module's `@/db/client`
 * import into the browser bundle — the build failed with "Module not
 * found: Can't resolve 'fs'" three times over, which is better than it
 * succeeding and shipping better-sqlite3 to a browser.
 *
 * A `type` import would have been erased; a const is a real reference,
 * and that is the whole difference. Rather than write the number twice —
 * the fourth standing rule, for a value that would drift the first time
 * anyone tuned it — the constant lives here and trial.ts re-exports it.
 */

/** The default trial size. Small enough for a person to check by hand. */
export const TRIAL_SIZE = 3;

export type TrialResult = {
  /** How many were attempted. */
  attempted: number;
  applied: number;
  failed: number;
  /** Per-action outcome, in the order attempted. */
  details: { id: number; ok: boolean; error?: string }[];
  /** One line for the UI. Never implies more than happened. */
  summary: string;
};
