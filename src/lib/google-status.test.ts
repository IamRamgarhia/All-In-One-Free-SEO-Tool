/**
 * Reading Google's Search Status Dashboard, on pages captured from it in
 * September 2026 (__fixtures__/google-status, scripts and styles cut).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyUpdate,
  pacificDate,
  parseHistoryPage,
  parseIncidentPage,
  updatesFromIncidentsJson,
} from "./google-status";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/google-status/${name}`, import.meta.url), "utf8");

describe("incidents.json", () => {
  const updates = updatesFromIncidentsJson(JSON.parse(fixture("incidents.json")));

  it("keeps ranking incidents and drops the others", () => {
    const raw = JSON.parse(fixture("incidents.json")) as { service_name: string }[];
    expect(raw.some((i) => i.service_name !== "Ranking")).toBe(true);
    expect(updates).toHaveLength(raw.filter((i) => i.service_name === "Ranking").length);
  });

  it("reads an update the way Google's own page shows it", () => {
    const u = updates.find((x) => x.name === "August 2026 spam update")!;
    expect(u).toMatchObject({
      type: "spam",
      date: "2026-08-18",
      endDate: "2026-08-21",
      url: "https://status.search.google.com/incidents/LEubPCm2octf2uMqCFKE",
    });
    expect(u.summary).toBe(
      "Released the August 2026 spam update, which applies globally and to all languages. The rollout may take a few days to complete.",
    );
  });

  it("dates the December 2025 core update as Google does, not as the old list did", () => {
    const u = updates.find((x) => x.name === "December 2025 core update")!;
    expect(u.date).toBe("2025-12-11");
    expect(u.endDate).toBe("2025-12-29");
  });

  it("fails loudly on a format it does not recognise", () => {
    expect(() => updatesFromIncidentsJson({ incidents: [] })).toThrow();
  });
});

describe("dates", () => {
  it("prints an instant as a Pacific date", () => {
    expect(pacificDate("2026-08-18T16:27:00+00:00")).toBe("2026-08-18");
  });

  it("moves an early-UTC instant back to the Pacific day it fell on", () => {
    expect(pacificDate("2025-12-11T02:00:00Z")).toBe("2025-12-10");
  });
});

describe("incident page", () => {
  const page = fixture("incident-page.html");

  it("reads start, end and the opening announcement", () => {
    expect(parseIncidentPage(page)).toEqual({
      date: "2026-08-18",
      endDate: "2026-08-21",
      summary:
        "Released the August 2026 spam update, which applies globally and to all languages. The rollout may take a few days to complete.",
    });
  });

  it("refuses to guess dates when the page stops naming its time zone", () => {
    expect(() => parseIncidentPage(page.replace(/All times are US\/Pacific/g, ""))).toThrow(/time zone/);
  });
});

describe("history page", () => {
  const rows = parseHistoryPage(fixture("ranking-history.html"));

  it("lists every incident on the page", () => {
    expect(rows).toHaveLength(41);
  });

  it("names each once, not twice", () => {
    expect(rows.find((r) => r.name === "May 2026 core update")).toBeDefined();
    for (const r of rows) expect(r.name, r.name).not.toMatch(/^(.+) \1$/);
  });
});

describe("classifying", () => {
  it.each([
    ["May 2026 core update", "core"],
    ["December 2022 link spam update", "spam"],
    ["September 2023 helpful content update", "helpful_content"],
    ["February 2023 product reviews update", "product_review"],
    ["November 2023 reviews update", "product_review"],
    ["Ranking is experiencing an ongoing issue.", "issue"],
    ["February 2026 Discover update", "other"],
  ] as const)("%s is %s", (name, type) => {
    expect(classifyUpdate(name)).toBe(type);
  });
});
