/**
 * The shipped list of Google ranking updates, held to Google's record.
 *
 * It replaced two hand-kept lists that had an update Google never
 * announced, a start date a week early, and nothing from 2026.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALGO_UPDATES, mergeUpdates, updatesNear, type AlgoUpdate } from "./algorithm-updates";

describe("the shipped history", () => {
  it("links every entry to Google's own incident page", () => {
    expect(ALGO_UPDATES.length).toBeGreaterThan(30);
    for (const u of ALGO_UPDATES) {
      expect(u.url, u.name).toMatch(/^https:\/\/status\.search\.google\.com\/incidents\/[A-Za-z0-9]+$/);
    }
  });

  it("does not contain the core update Google never announced", () => {
    expect(ALGO_UPDATES.find((u) => /september 2025 core/i.test(u.name))).toBeUndefined();
  });

  it("starts the December 2025 core update on Google's date", () => {
    expect(ALGO_UPDATES.find((u) => u.name === "December 2025 core update")?.date).toBe("2025-12-11");
  });

  it("includes this year's updates", () => {
    const names = ALGO_UPDATES.map((u) => u.name);
    for (const n of [
      "March 2026 core update",
      "March 2026 spam update",
      "May 2026 core update",
      "June 2026 spam update",
      "August 2026 spam update",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("has real dates that run forwards", () => {
    for (const u of ALGO_UPDATES) {
      expect(u.date, u.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (u.endDate) expect(u.endDate >= u.date, u.name).toBe(true);
    }
  });

  it("is the only dated list — the page no longer keeps its own", () => {
    const page = readFileSync(new URL("../app/algorithm-updates/page.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/date:\s*"\d{4}-\d{2}-\d{2}"/);
  });
});

const u = (id: string, date: string, endDate?: string): AlgoUpdate => ({
  id,
  name: id,
  type: "core",
  date,
  ...(endDate ? { endDate } : {}),
  url: `https://status.search.google.com/incidents/${id}`,
  summary: "",
});

describe("lining a date range up against updates", () => {
  const list = [u("a", "2026-05-21", "2026-06-02"), u("b", "2026-03-24", "2026-03-25")];

  it("finds an update that overlaps the range", () => {
    expect(updatesNear(list, "2026-05-01", "2026-05-28").map((x) => x.id)).toEqual(["a"]);
  });

  it("allows the margin on either side, and no more", () => {
    expect(updatesNear(list, "2026-03-28", "2026-04-10").map((x) => x.id)).toEqual(["b"]);
    expect(updatesNear(list, "2026-03-29", "2026-04-10")).toEqual([]);
  });

  it("treats an update with no end date as still running", () => {
    const rolling = [u("c", "2026-09-01")];
    const today = new Date().toISOString().slice(0, 10);
    expect(updatesNear(rolling, today, today, 0)).toHaveLength(1);
  });
});

describe("merging the refresh into the shipped history", () => {
  it("keeps one entry per incident and lets the newer read win", () => {
    const merged = mergeUpdates([u("a", "2026-09-01")], [u("a", "2026-09-01", "2026-09-10"), u("b", "2026-09-05")]);
    expect(merged.map((x) => x.id)).toEqual(["b", "a"]);
    expect(merged.find((x) => x.id === "a")?.endDate).toBe("2026-09-10");
  });
});
