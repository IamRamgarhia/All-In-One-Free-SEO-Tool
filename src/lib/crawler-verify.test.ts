/**
 * Telling a real crawler from a user agent that says it is one.
 *
 * Fixtures in __fixtures__/crawler-ips are the published lists as
 * fetched in September 2026, cut down to a few ranges each. Addresses in
 * the log lines are chosen inside or outside those ranges; outside ones
 * use the documentation blocks (192.0.2.0/24, 2001:db8::/32).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clientAddressOf,
  inRanges,
  proxyAddressWarning,
  rangesFrom,
  tally,
} from "./crawler-verify";

const list = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`./__fixtures__/crawler-ips/${name}`, import.meta.url), "utf8"),
  ) as unknown;

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const line = (address: string, ua = GOOGLEBOT_UA) =>
  `${address} - - [13/Sep/2026:10:00:00 +0000] "GET /products HTTP/1.1" 200 5120 "-" "${ua}"`;

describe("published ranges", () => {
  const google = rangesFrom(list("google-common-crawlers.json"));

  it("accepts an IPv4 address inside Google's crawler range", () => {
    expect(inRanges(google, "192.178.4.5")).toBe(true);
  });

  it("accepts an IPv6 address inside it", () => {
    expect(inRanges(google, "2001:4860:4801:10::1")).toBe(true);
  });

  it("rejects an address just outside the range", () => {
    // 192.178.4.0/27 ends at .31.
    expect(inRanges(google, "192.178.4.32")).toBe(false);
  });

  it("rejects documentation addresses and non-addresses", () => {
    expect(inRanges(google, "192.0.2.1")).toBe(false);
    expect(inRanges(google, "2001:db8::1")).toBe(false);
    expect(inRanges(google, "googlebot.com")).toBe(false);
  });

  it("merges more than one list", () => {
    const both = rangesFrom(list("bingbot.json"), list("gptbot.json"));
    expect(inRanges(both, "157.55.39.10")).toBe(true);
    expect(inRanges(both, "132.196.86.200")).toBe(true);
  });

  it("reads Anthropic's list, which covers all three of its agents", () => {
    const anthropic = rangesFrom(list("anthropic-bots.json"));
    expect(inRanges(anthropic, "216.73.219.254")).toBe(true); // end of the /22
    expect(inRanges(anthropic, "216.73.220.1")).toBe(false);
    expect(inRanges(anthropic, "34.162.230.222")).toBe(true);
  });

  it("refuses a list it cannot read rather than verifying nothing", () => {
    // An empty matcher would call every real Googlebot hit an impostor.
    expect(() => rangesFrom({ ranges: ["192.178.4.0/27"] })).toThrow();
    expect(() => rangesFrom({ prefixes: [] })).toThrow();
  });
});

describe("reading the address from a log line", () => {
  it("takes the first field of a combined log line", () => {
    expect(clientAddressOf(line("192.178.4.5"))).toBe("192.178.4.5");
  });

  it("reads IPv6", () => {
    expect(clientAddressOf(line("2001:4860:4801:10::1"))).toBe("2001:4860:4801:10::1");
  });

  it("skips a leading virtual host", () => {
    expect(clientAddressOf(`example.com:443 ${line("157.55.39.10")}`)).toBe("157.55.39.10");
  });

  it("returns null when the line has no address", () => {
    expect(clientAddressOf(`- - [13/Sep/2026] "GET / HTTP/1.1" 200 1 "-" "${GOOGLEBOT_UA}"`)).toBeNull();
  });
});

describe("counting", () => {
  const google = rangesFrom(list("google-common-crawlers.json"));

  it("separates real Googlebot hits from impostors", () => {
    const hits = new Map<string | null, number>([
      ["192.178.4.5", 40],
      ["2001:4860:4801:10::7", 10],
      ["192.0.2.44", 25],
      [null, 2],
    ]);
    expect(tally(hits, google)).toEqual({ verified: 50, unverified: 25, noAddress: 2 });
  });
});

describe("a log written behind a proxy", () => {
  it("explains zero verified hits instead of calling every crawler fake", () => {
    const warning = proxyAddressWarning({
      Googlebot: { verified: 0, unverified: 180, noAddress: 0 },
      Bingbot: { verified: 0, unverified: 40, noAddress: 0 },
    });
    expect(warning).toMatch(/proxy/);
    expect(warning).toMatch(/220/);
  });

  it("stays quiet when some hits verified", () => {
    expect(
      proxyAddressWarning({
        Googlebot: { verified: 5, unverified: 180, noAddress: 0 },
      }),
    ).toBeNull();
  });

  it("does not count crawlers whose list failed to load", () => {
    expect(
      proxyAddressWarning({
        Googlebot: { verified: 0, unverified: 0, noAddress: 0, listError: "HTTP 503" },
      }),
    ).toBeNull();
  });
});
