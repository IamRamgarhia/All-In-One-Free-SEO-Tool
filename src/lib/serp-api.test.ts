import { describe, expect, it } from "vitest";
import { parseDataForSeo, parseSerper } from "./serp-api";
import { rankInResults } from "./rank-checker";

describe("Serper answers", () => {
  it("reads organic links in position order", () => {
    const json = {
      organic: [
        { title: "b", link: "https://b.fr/", position: 2 },
        { title: "a", link: "https://a.fr/page", position: 1 },
        { title: "no link", position: 3 },
      ],
    };
    expect(parseSerper(json)).toEqual(["https://a.fr/page", "https://b.fr/"]);
  });

  it("gives nothing on an unexpected body", () => {
    expect(parseSerper({ message: "Unauthorized." })).toEqual([]);
    expect(parseSerper(null)).toEqual([]);
  });
});

describe("DataForSEO answers", () => {
  const ok = (items: unknown[]) => ({
    status_code: 20000,
    tasks: [{ status_code: 20000, result: [{ items }] }],
  });

  it("keeps organic results only, by organic rank", () => {
    const r = parseDataForSeo(
      ok([
        { type: "paid", url: "https://ad.fr/", rank_group: 1 },
        { type: "organic", url: "https://second.fr/", rank_group: 2 },
        { type: "local_pack", url: "https://maps.fr/", rank_group: 1 },
        { type: "organic", url: "https://first.fr/", rank_group: 1 },
      ]),
    );
    expect(r).toEqual({ urls: ["https://first.fr/", "https://second.fr/"] });
  });

  it("reports the provider's error instead of an empty result", () => {
    expect(parseDataForSeo({ status_code: 40100, status_message: "You are not authorized." }).error).toBe(
      "You are not authorized.",
    );
    expect(
      parseDataForSeo({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field" }] }).error,
    ).toBe("Invalid Field");
  });
});

describe("position among API results", () => {
  it("counts one entry per page and matches subdomains", () => {
    const urls = [
      "https://concurrent.fr/",
      "https://concurrent.fr/", // the same page twice (sitelink)
      "https://www.nd-prestige.com/transfert-aeroport-orly",
    ];
    expect(rankInResults(urls, "nd-prestige.com")).toEqual({
      position: 2,
      url: "https://www.nd-prestige.com/transfert-aeroport-orly",
      resultsScanned: 2,
    });
    expect(rankInResults(urls, "absent.fr").position).toBeNull();
  });
});
