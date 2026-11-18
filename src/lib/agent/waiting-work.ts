/**
 * How much the agent has found and is not allowed to do.
 *
 * Measured on a real install, 19 Nov 2026: 57 agent runs, 59 actions
 * planned, 14 sitting `queued`, the oldest from late September — eight
 * weeks. No autonomy level had ever been chosen, so the agent was
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

/**
 * One sentence for the autonomy prompt, or null when there is nothing
 * worth saying.
 *
 * Returns null rather than "0 changes are waiting" on purpose: an
 * install that has only just been set up has nothing queued, and
 * telling it so adds a line of noise to the first screen somebody sees.
 */
export function describeWaitingWork(
  work: WaitingWork,
  now: Date = new Date(),
): string | null {
  if (work.queued <= 0) return null;

  const changes = work.queued === 1 ? "1 change" : `${work.queued} changes`;
  if (!work.oldest) return `${changes} are waiting for an answer.`;

  const days = Math.floor(
    (now.getTime() - work.oldest.getTime()) / (24 * 60 * 60 * 1000),
  );

  // Under a day is "today" rather than "0 days", and the grammar has to
  // survive the singular at every scale.
  let age: string;
  if (days < 1) age = "today";
  else if (days === 1) age = "since yesterday";
  else if (days < 14) age = `for ${days} days`;
  else if (days < 60) {
    const weeks = Math.floor(days / 7);
    age = `for ${weeks} week${weeks === 1 ? "" : "s"}`;
  } else {
    const months = Math.floor(days / 30);
    age = `for ${months} month${months === 1 ? "" : "s"}`;
  }

  const verb = work.queued === 1 ? "has" : "have";
  return days < 1
    ? `${changes} are already waiting, found ${age}.`
    : `${changes} ${verb} been waiting ${age}.`;
}
