import { describe, expect, it } from "vitest";
import { workDoneItems, type WorkDoneRow } from "./work-done";

const row = (id: number, kind: string, entityId: number | null, day: number): WorkDoneRow => ({
  id,
  kind,
  message: `${kind} ${id}`,
  createdAt: new Date(2026, 10, day),
  entityType: entityId === null ? null : "task",
  entityId,
  pageUrl: null,
});

describe("workDoneItems", () => {
  it("shows a task closed from a tool once, with the tool's line", () => {
    const items = workDoneItems([row(1, "task.completed", 41, 20), row(2, "tool.task_completed", 41, 20)]);
    expect(items.map((r) => r.kind)).toEqual(["tool.task_completed"]);
  });

  it("keeps other completed tasks, newest first, and leaves out other kinds", () => {
    const items = workDoneItems([
      row(1, "task.completed", 5, 10),
      row(2, "tool.task_added", 6, 12),
      row(3, "audit.completed", null, 15),
      row(4, "tool.fix_checked", 7, 11),
    ]);
    expect(items.map((r) => r.id)).toEqual([2, 4, 1]);
  });

  it("stops at the limit", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, "task.completed", i + 1, i + 1));
    expect(workDoneItems(rows, 8)).toHaveLength(8);
  });
});
