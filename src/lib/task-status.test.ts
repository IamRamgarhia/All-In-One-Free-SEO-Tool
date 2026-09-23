import { describe, it, expect } from "vitest";
import { isOpenTask, isClosedTask, type TaskStatus } from "./task-status";

const ALL: TaskStatus[] = ["todo", "in_progress", "done", "skipped"];

describe("isOpenTask", () => {
  it("counts todo and in_progress as open", () => {
    expect(ALL.filter(isOpenTask)).toEqual(["todo", "in_progress"]);
  });

  it("does not count a skipped task as open", () => {
    // The whole point of skipping is that it stops being work. Reading it
    // as open put decided-against tasks back in front of the client, in
    // the portal and in the report's recommendations.
    expect(isOpenTask("skipped")).toBe(false);
  });

  it("splits every status into exactly one of open or closed", () => {
    for (const status of ALL) {
      expect(isOpenTask(status)).toBe(!isClosedTask(status));
    }
  });
});
