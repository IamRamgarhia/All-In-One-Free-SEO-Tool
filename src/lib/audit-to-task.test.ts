/**
 * Audit findings into tasks, and the page each task names.
 *
 * The blueprint titles all said "homepage", whatever page the finding was
 * on. On a real client they were all about /cdn-cgi/l/email-protection,
 * and the task list told the owner to "Remove noindex from homepage
 * robots meta" for a homepage that was never noindexed. A task naming the
 * wrong page sends somebody to change something already correct.
 */

import { describe, expect, it } from "vitest";
import type { AuditFinding } from "./audit";
import { findingsToTasks, placeOf } from "./audit-to-task";

function finding(
  type: string,
  url: string,
  severity: AuditFinding["severity"] = "high",
  message = `${type} found.`,
): AuditFinding {
  return { type, url, severity, message } as AuditFinding;
}

/** Blueprint types whose title names a page. */
const PAGE_LEVEL = [
  "bad_status",
  "missing_title",
  "short_title",
  "long_title",
  "missing_meta_description",
  "short_meta_description",
  "long_meta_description",
  "missing_h1",
  "missing_canonical",
  "noindex_set",
  "missing_og_tags",
  "missing_image_alt",
];

describe("naming the right page", () => {
  it("never says homepage for a finding that is not on the homepage", () => {
    const wrong: string[] = [];
    for (const type of PAGE_LEVEL) {
      const [task] = findingsToTasks([finding(type, "https://prateektapes.com/about")]);
      if (!task || /homepage/i.test(task.title) || !task.title.includes("/about")) {
        wrong.push(`${type}: ${task?.title ?? "(no task)"}`);
      }
    }
    expect(wrong, `These name the wrong page:\n  ${wrong.join("\n  ")}`).toEqual([]);
  });

  it("says homepage when it really is the homepage", () => {
    const [task] = findingsToTasks([finding("noindex_set", "https://prateektapes.com/")]);
    expect(task.title).toBe("Remove noindex from your homepage");
  });

  it("says how many pages when there are several", () => {
    const tasks = findingsToTasks([
      finding("missing_meta_description", "https://x.com/a"),
      finding("missing_meta_description", "https://x.com/b"),
      finding("missing_meta_description", "https://x.com/c"),
    ]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Write a meta description for 3 pages");
    // And lists them, so nobody has to re-run the audit to find out which.
    expect(tasks[0].description).toContain("https://x.com/b");
  });
});

describe("what never becomes a task", () => {
  it("drops the Cloudflare link that produced this whole class of task", () => {
    const tasks = findingsToTasks([
      finding("bad_status", "https://prateektapes.com/cdn-cgi/l/email-protection", "critical"),
      finding("noindex_set", "https://prateektapes.com/cdn-cgi/l/email-protection", "high"),
    ]);
    expect(tasks).toEqual([]);
  });

  it("keeps the real finding when infrastructure sits beside it", () => {
    const tasks = findingsToTasks([
      finding("noindex_set", "https://prateektapes.com/cdn-cgi/l/email-protection"),
      finding("noindex_set", "https://prateektapes.com/about"),
    ]);
    expect(tasks.map((t) => t.title)).toEqual(["Remove noindex from /about"]);
  });

  it("leaves low severity out", () => {
    expect(findingsToTasks([finding("missing_title", "https://x.com/a", "low")])).toEqual([]);
  });
});

describe("what callers need from it", () => {
  it("returns the finding type, which audit runs use to avoid duplicates", () => {
    const [task] = findingsToTasks([finding("missing_canonical", "https://x.com/a")]);
    expect(task.type).toBe("missing_canonical");
  });

  it("takes the worst severity in a group for the priority", () => {
    const [task] = findingsToTasks([
      finding("bad_status", "https://x.com/a", "medium"),
      finding("bad_status", "https://x.com/b", "critical"),
    ]);
    expect(task.priority).toBe("high");
  });
});

describe("placeOf", () => {
  it("counts a repeated URL once", () => {
    expect(placeOf(["https://x.com/a", "https://x.com/a"])).toBe("/a");
  });

  it("treats a bare root as the homepage", () => {
    expect(placeOf(["https://x.com"])).toBe("your homepage");
  });
});
