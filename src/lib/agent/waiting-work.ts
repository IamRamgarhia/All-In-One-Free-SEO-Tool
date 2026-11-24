/**
 * How much the agent has found and is not allowed to do.
 *
 * Ported from upstream, where it was measured on a real install:
 * 14 actions sitting `queued`, the oldest eight weeks old. No autonomy level had ever been chosen, so the agent was
 * running on the cautious default and doing exactly what it is supposed
 * to: find work, change nothing, wait to be asked.
 *
 * The default is right. The silence around it is not. The prompt that
 * asks the question said only "it finds work every night and changes
 * nothing" — an abstraction that is easy to scroll past. "Fourteen
 * changes have been waiting eight weeks" is the same fact with the cost
 * attached, and it is the version somebody acts on.
 *
 * Pure formatting kept separate from the query so it can be tested
 * without a database.
 */

export type WaitingWork = {
  /** Actions the agent proposed and is holding. */
  queued: number;
  /** When the oldest of them was created, or null if nothing waits. */
  oldest: Date | null;
};

/** Which sentence to use, and the number that goes in it. */
export type WaitingAge =
  | { unit: "today" }
  | { unit: "yesterday" }
  | { unit: "days"; n: number }
  | { unit: "weeks"; n: number }
  | { unit: "months"; n: number }
  | { unit: "unknown" };

export type WaitingDescription = { count: number; age: WaitingAge };

/**
 * What the autonomy prompt should say about the queue, or null when
 * there is nothing worth saying.
 *
 * Returns null rather than "0 changes are waiting" on purpose: an
 * install that has only just been set up has nothing queued, and
 * telling it so adds a line of noise to the first screen somebody sees.
 *
 * Returns the shape of the sentence rather than the sentence, because
 * this fork words it in French and English (`dashboard.autonomy.waiting`
 * in the message files). The grammar decisions stay here and tested:
 * "today" rather than "0 days", "since yesterday" rather than "1 days",
 * weeks from two weeks, months past the point weeks stop reading.
 */
export function describeWaitingWork(
  work: WaitingWork,
  now: Date = new Date(),
): WaitingDescription | null {
  if (work.queued <= 0) return null;
  const count = work.queued;
  if (!work.oldest || !Number.isFinite(work.oldest.getTime())) {
    return { count, age: { unit: "unknown" } };
  }

  const days = Math.floor(
    (now.getTime() - work.oldest.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (days < 1) return { count, age: { unit: "today" } };
  if (days === 1) return { count, age: { unit: "yesterday" } };
  if (days < 14) return { count, age: { unit: "days", n: days } };
  if (days < 60) return { count, age: { unit: "weeks", n: Math.floor(days / 7) } };
  return { count, age: { unit: "months", n: Math.floor(days / 30) } };
}
