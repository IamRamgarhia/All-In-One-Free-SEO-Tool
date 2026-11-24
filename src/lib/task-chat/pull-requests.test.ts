import { describe, expect, it } from "vitest";
import { checkState, toTaskPr } from "./pull-requests";

const raw = (over: Record<string, unknown> = {}) => ({
  number: 7,
  title: "SEO task 7",
  url: "https://github.com/o/r/pull/7",
  headRefName: "seo/task-7-fix-titles",
  isDraft: false,
  mergeable: "MERGEABLE",
  statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }],
  ...over,
});

describe("checkState", () => {
  it("is none without checks", () => {
    expect(checkState(null)).toBe("none");
    expect(checkState([])).toBe("none");
  });

  it("is passing when every check is green or skipped", () => {
    expect(
      checkState([
        { status: "COMPLETED", conclusion: "SUCCESS" },
        { status: "COMPLETED", conclusion: "SKIPPED" },
        { state: "SUCCESS" },
      ]),
    ).toBe("passing");
  });

  it("is pending while one is running, failing as soon as one fails", () => {
    expect(checkState([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "SUCCESS" }])).toBe("pending");
    expect(checkState([{ state: "PENDING" }])).toBe("pending");
    expect(checkState([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "FAILURE" }])).toBe("failing");
    expect(checkState([{ state: "ERROR" }])).toBe("failing");
  });
});

describe("toTaskPr", () => {
  it("only takes seo/task-<id> branches", () => {
    expect(toTaskPr(raw({ headRefName: "feature/x" }))).toBeNull();
    expect(toTaskPr(raw({ headRefName: "seo/task-x" }))).toBeNull();
    expect(toTaskPr(raw())?.taskId).toBe(7);
  });

  it("takes a whole-run branch too, without a task id", () => {
    const pr = toTaskPr(raw({ headRefName: "seo/batch-20261026-1240" }));
    expect(pr?.taskId).toBeNull();
    expect(toTaskPr(raw({ headRefName: "seo/batch-" }))).toBeNull();
  });

  it("is ready when it can merge and checks pass", () => {
    expect(toTaskPr(raw())?.ready).toBe(true);
    expect(toTaskPr(raw({ statusCheckRollup: [] }))?.ready).toBe(true);
  });

  it("is not ready with conflicts, a draft, or checks not passing", () => {
    expect(toTaskPr(raw({ mergeable: "CONFLICTING" }))?.ready).toBe(false);
    expect(toTaskPr(raw({ mergeable: "UNKNOWN" }))?.ready).toBe(false);
    expect(toTaskPr(raw({ isDraft: true }))?.ready).toBe(false);
    expect(toTaskPr(raw({ statusCheckRollup: [{ status: "IN_PROGRESS" }] }))?.ready).toBe(false);
    expect(toTaskPr(raw({ statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }] }))?.ready).toBe(false);
  });
});
