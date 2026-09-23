/**
 * What counts as outstanding work.
 *
 * Six places asked this question as `status !== "done"`, which quietly
 * made every *skipped* task outstanding again — including on the client
 * portal and in the generated report, where a task we decided against
 * came back as a recommendation. One predicate, one meaning.
 */

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

/** Still to do. Skipped is a decision, so it is not open. */
export function isOpenTask(status: string): boolean {
  return status === "todo" || status === "in_progress";
}

/** Dealt with — either finished or deliberately not doing it. */
export function isClosedTask(status: string): boolean {
  return !isOpenTask(status);
}
