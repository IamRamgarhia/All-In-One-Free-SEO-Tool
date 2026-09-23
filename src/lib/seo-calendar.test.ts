/**
 * The 30-day calendar, on the parts a real client's plan got wrong.
 *
 * Three things in one downloaded plan: the same image-format task on
 * consecutive days, because audit rows are one per page; three "Write
 * content brief #N" tasks with an identical explanation; and a
 * low-severity tidy-up described as capping the client's rankings.
 */

import { describe, expect, it } from "vitest";
import { generateCalendar, severityRationale, summariseTopIssues } from "./seo-calendar";

const row = (type: string, severity: string, message: string) => ({ type, severity, message });

describe("summarising audit findings for the plan", () => {
  // The real shape of the client's remaining findings: many pages per type.
  const rows = [
    ...Array.from({ length: 15 }, (_, i) =>
      row("old_image_formats", "low", `${10 + (i % 3) * 5} images use legacy formats — convert to WebP/AVIF for ~30% smaller files.`),
    ),
    ...Array.from({ length: 20 }, () => row("heading_order", "low", "Heading levels skip from h2 to h4.")),
    row("bad_status", "critical", "Server returned HTTP 500 on /pricing."),
  ];

  it("gives one entry per finding type, not one per page", () => {
    const out = summariseTopIssues(rows);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((o) => o.title)).size).toBe(3);
  });

  it("puts the most severe first", () => {
    expect(summariseTopIssues(rows)[0].severity).toBe("critical");
  });

  it("drops a per-page count that would read as the total", () => {
    // "10 images use legacy formats (15 pages)" claims ten images when
    // ten is one page's figure.
    const images = summariseTopIssues(rows).find((o) => /legacy formats/i.test(o.title))!;
    expect(images.title).toBe("Images use legacy formats (15 pages)");
  });

  it("keeps the problem when the dash introduces it rather than advice", () => {
    // Caught in a dry run on a real client before it was written back:
    // cutting at every dash turned "LCP 2.97s — over the 2.5s threshold"
    // into "LCP 2.97s", which says nothing about what is wrong.
    const [lcp] = summariseTopIssues([
      row("slow_lcp", "high", "LCP 2.97s — over the 2.5s threshold."),
    ]);
    expect(lcp.title).toBe("LCP 2.97s — over the 2.5s threshold");
  });

  it("ends the headline at the first sentence", () => {
    const [byline] = summariseTopIssues([
      row("eeat_byline", "high", "No author byline. Anonymous content gets penalized on YMYL."),
    ]);
    expect(byline.title).toBe("No author byline");
  });

  it("keeps the specific wording when there is only one page", () => {
    const one = summariseTopIssues([row("old_image_formats", "low", "10 images use legacy formats — convert.")]);
    expect(one[0].title).toBe("10 images use legacy formats");
  });
});

describe("describing severity honestly", () => {
  it("does not tell a client a low-severity finding limits their rankings", () => {
    // It may say it is NOT a ranking problem. It must not say it is one.
    // The first version of this regex matched the words "ranking
    // problem" and so failed on the sentence denying it.
    const claimsHarm = /\bcap\b|\bblocks?\b|can stop|limits? (your |their )?rankings?/i;
    expect(severityRationale("low")).not.toMatch(claimsHarm);
    expect(severityRationale("low")).toMatch(/low severity/i);
    // Guards the guard: the sentence this replaced must trip it.
    expect(
      "Severity low. Open issues at this level cap how much downstream work can move rankings.",
    ).toMatch(claimsHarm);
  });

  it("gives each severity its own explanation", () => {
    const all = ["critical", "high", "medium", "low"].map(severityRationale);
    expect(new Set(all).size).toBe(4);
  });
});

describe("the generated plan", () => {
  const base = {
    clientId: 39,
    clientName: "Prateek Tapes",
    niche: "local" as const,
    techStack: [] as string[],
    country: "IN",
    city: "delhi",
    hasGsc: false,
    hasGbp: false,
  };

  it("does not pad one content-brief job into three identical tasks", () => {
    const cal = generateCalendar({ ...base, quickWins: [], topIssues: [] });
    const briefs = cal.filter((t) => /content brief/i.test(t.title));
    expect(briefs).toHaveLength(1);
  });

  it("never repeats the old sentence about capping rankings", () => {
    const cal = generateCalendar({
      ...base,
      quickWins: [],
      topIssues: [{ title: "Images use legacy formats (15 pages)", severity: "low" }],
    });
    for (const t of cal) {
      expect(t.whyItMatters, t.title).not.toMatch(/cap how much downstream work/i);
    }
  });

  it("gives a low-severity finding a low priority", () => {
    const cal = generateCalendar({
      ...base,
      quickWins: [],
      topIssues: [{ title: "Heading levels skip from h2 to h4 (20 pages)", severity: "low" }],
    });
    const task = cal.find((t) => t.title.startsWith("Fix: Heading"))!;
    expect(task.priority).toBe("low");
  });

  it("makes no claim the tool cannot back up", () => {
    // "double the traffic" and "10-20% bigger" were both in the plan,
    // with no source, in a document clients receive.
    const cal = generateCalendar({ ...base, quickWins: [], topIssues: [] });
    for (const t of cal) {
      expect(t.whyItMatters, t.title).not.toMatch(/double the traffic|10-20%/i);
    }
  });
});
