/**
 * The two spellings of "could not reach the site", and the cause that
 * gets thrown away in between.
 *
 * The strings here were MEASURED on 19 Nov 2026 against
 * `d.dicecodes.com` — a client on this install whose domain had stopped
 * resolving, and the cause of 13 of 15 nightly sweep failures. Both
 * paths were run for real:
 *
 *   fetch:      TypeError: fetch failed
 *               cause → getaddrinfo ENOTFOUND d.dicecodes.com
 *   Playwright: page.goto: net::ERR_NAME_NOT_RESOLVED at https://d.dicecodes.com/
 *
 * Three separate bugs live in that pair:
 *
 *   1. `checkSweepFailures` matched ENOTFOUND but not
 *      ERR_NAME_NOT_RESOLVED, so browser-sourced failures on a dead
 *      domain did not trigger "the site is unreachable, check the
 *      address" — the one line that fixes it in a minute.
 *   2. `friendly-error.ts`'s DNS rule had the same blind spot, so the
 *      same failure got "unknown error" and an invitation to file a
 *      GitHub issue about a domain typo.
 *   3. The sweep stored `(err as Error).message`, which for a failed
 *      fetch is the bare string "fetch failed". The code naming the
 *      cause was on `err.cause` and was discarded — so the stored
 *      record could not have diagnosed itself even with a perfect
 *      classifier.
 *
 * These are fixture tests for strings produced by software this project
 * does not control, which is the project's standing rule: anything whose
 * failure is a silently-wrong answer gets a fixture.
 */

import { describe, expect, it } from "vitest";
import {
  classifyNetworkError,
  describeNetworkFailure,
  errorText,
  isUnreachable,
  leadingFailureKind,
  type NetworkFailureKind,
} from "./network-error";
import { friendlyError } from "./friendly-error";

/** Captured, not recalled. See the header. */
const MEASURED = {
  fetchDns: "TypeError: fetch failed",
  fetchDnsCause: "getaddrinfo ENOTFOUND d.dicecodes.com",
  playwrightDns:
    "page.goto: net::ERR_NAME_NOT_RESOLVED at https://d.dicecodes.com/",
};

describe("classifying a network error", () => {
  it("reads the DNS failure from BOTH stacks as dns", () => {
    // The whole point. These two strings share no substring longer than
    // "RE", and before this module only the first was recognised.
    expect(classifyNetworkError(MEASURED.fetchDnsCause)).toBe("dns");
    expect(classifyNetworkError(MEASURED.playwrightDns)).toBe("dns");
  });

  it("still classifies the bare message the sweep used to store", () => {
    // "fetch failed" with no cause cannot name the reason, but it is
    // definitely not a success — and it is what thousands of stored
    // rows on existing installs say.
    expect(classifyNetworkError(MEASURED.fetchDns)).toBe("no_response");
    expect(isUnreachable(MEASURED.fetchDns)).toBe(true);
  });

  const cases: [string, NetworkFailureKind][] = [
    // Node / undici
    ["getaddrinfo EAI_AGAIN example.invalid", "dns"],
    ["connect ECONNREFUSED 127.0.0.1:3000", "refused"],
    ["read ECONNRESET", "refused"],
    ["connect ETIMEDOUT 10.0.0.1:443", "timeout"],
    ["Connect Timeout Error (attempted address: example.com:443, timeout: 10000ms)", "timeout"],
    // Node gives the sentence on `.message` and the code on `.code`.
    // Whichever one a call site stored is the only one the classifier
    // ever sees, so both spellings are covered.
    ["certificate has expired", "tls"],
    ["unable to verify the first certificate", "tls"],
    ["CERT_HAS_EXPIRED", "tls"],
    ["Hostname/IP does not match certificate's altnames", "tls"],
    // Chromium / Playwright
    ["page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:9999/", "refused"],
    ["page.goto: net::ERR_CONNECTION_TIMED_OUT at https://example.com/", "timeout"],
    ["page.goto: net::ERR_CERT_AUTHORITY_INVALID at https://self-signed.example/", "tls"],
    ["page.goto: net::ERR_INTERNET_DISCONNECTED at https://example.com/", "offline"],
    ["page.goto: Timeout 30000ms exceeded.", "timeout"],
  ];

  for (const [raw, kind] of cases) {
    it(`${kind}: ${raw.slice(0, 54)}`, () => {
      expect(classifyNetworkError(raw)).toBe(kind);
    });
  }

  it("recognises this app's OWN prose for an unreachable site", () => {
    // Captured by running the real nightly sweep against a copy. Every
    // one of these is a tool that caught a network error and wrote its
    // own sentence, discarding the code — so these are the strings the
    // health report actually has to work with, not the ones undici
    // produced.
    for (const raw of [
      "Hop 1 failed: fetch failed",
      "Couldn't fetch https://d.dicecodes.com (0)",
      "Couldn't reach https://d.dicecodes.com.",
      "Couldn't reach the site.",
      "Couldn't reach the site to extract metadata.",
      "Couldn't fetch llms.txt: fetch failed",
    ]) {
      expect(isUnreachable(raw), `not recognised: ${raw}`).toBe(true);
    }
  });

  it("returns null for failures that are NOT about reaching a site", () => {
    // The important half. Reading any of these as "the site is down"
    // sends someone to re-check an address that is fine — and two of
    // them are the app's own fault, not the network's.
    for (const raw of [
      "the tool reported a failure",
      "API_KEY_INVALID",
      "429 Too Many Requests",
      "Unexpected token < in JSON at position 0",
      "HTTP 503 from https://example.com/",
      "no AI provider is configured",
      "could not fetch the model list", // "fetch" alone must not match
      "",
    ]) {
      expect(classifyNetworkError(raw), `classified: ${raw}`).toBeNull();
      expect(isUnreachable(raw)).toBe(false);
    }
  });

  it("accepts an Error as well as a string", () => {
    expect(classifyNetworkError(new Error(MEASURED.playwrightDns))).toBe("dns");
    expect(classifyNetworkError(undefined)).toBeNull();
    expect(classifyNetworkError(null)).toBeNull();
  });

  it("every kind has a plain-language line", () => {
    const kinds: NetworkFailureKind[] = [
      "dns",
      "refused",
      "timeout",
      "tls",
      "offline",
      "no_response",
    ];
    for (const k of kinds) {
      const s = describeNetworkFailure(k);
      expect(s.length, `${k} has no description`).toBeGreaterThan(20);
      // About the SITE, not about undici. These are shown next to a
      // client whose checks failed.
      expect(s).not.toMatch(/undici|ENOTFOUND|net::/);
    }
  });
});

describe("one diagnosis for a batch", () => {
  it("prefers the check that KEPT the cause over the eight that lost it", () => {
    // The exact shape measured on this install: nine checks failed on
    // one client, eight with the cause stripped out by the tool's own
    // prose, one carrying ENOTFOUND. A majority vote says "the reason
    // was not recorded" while holding the reason.
    const batch = [
      "Couldn't fetch https://d.dicecodes.com (0)",
      "Couldn't reach https://d.dicecodes.com.",
      "Couldn't reach the site to extract metadata.",
      "Hop 1 failed: fetch failed",
      "Couldn't fetch llms.txt: fetch failed",
      "Couldn't fetch https://d.dicecodes.com (0)",
      "Couldn't reach the site.",
      "Couldn't fetch https://d.dicecodes.com (0)",
      "Couldn't reach the site: fetch failed: ENOTFOUND getaddrinfo ENOTFOUND d.dicecodes.com",
    ];
    expect(leadingFailureKind(batch)).toBe("dns");
  });

  it("falls back to the vague kind only when nothing else classified", () => {
    expect(leadingFailureKind(["fetch failed", "fetch failed"])).toBe(
      "no_response",
    );
  });

  it("is a majority vote among the kinds that DO say something", () => {
    expect(
      leadingFailureKind([
        "connect ECONNREFUSED 127.0.0.1:443",
        "connect ECONNREFUSED 127.0.0.1:80",
        "getaddrinfo ENOTFOUND x.invalid",
        "fetch failed",
      ]),
    ).toBe("refused");
  });

  it("returns null when none of them is a network failure", () => {
    expect(leadingFailureKind(["403 permission denied", "bad JSON"])).toBeNull();
    expect(leadingFailureKind([])).toBeNull();
  });
});

describe("the user-facing translation uses the same table", () => {
  it("explains a browser DNS failure instead of inviting a bug report", () => {
    // Bug #2 in the header. `friendly-error.ts`'s DNS rule was
    // /ENOTFOUND|getaddrinfo|DNS/i, so the Playwright spelling fell
    // through every rule to the generic "unknown error" case — whose
    // whole purpose is a prefilled GitHub issue link. A misspelled
    // client URL therefore asked the user to report a bug in this app.
    const fe = friendlyError(MEASURED.playwrightDns, "test");
    expect(fe.title).toMatch(/DNS/i);
    // The fallback's own title, which is what this used to return.
    // (Every result carries a githubIssue — the fallback is identified
    // by its wording, not by the absence of one.)
    expect(fe.title).not.toBe("Something went wrong");
    expect(fe.explanation).not.toMatch(/don't have a one-click fix/);
    expect(fe.steps.length).toBeGreaterThan(0);
  });

  it("still explains the fetch spelling, which already worked", () => {
    const fe = friendlyError(MEASURED.fetchDnsCause, "test");
    expect(fe.title).toMatch(/DNS/i);
  });

  it("does not claim DNS for an error that is not about the network", () => {
    // The regression risk of widening a pattern: the generic case has
    // to keep working, or every unknown error becomes "DNS lookup
    // failed" and nobody can report anything.
    const fe = friendlyError("Unexpected token < in JSON at position 0", "test");
    expect(fe.title).not.toMatch(/DNS/i);
  });
});

describe("errorText keeps the cause", () => {
  it("recovers the code that `.message` alone discards", () => {
    // This is the real shape: undici throws a TypeError whose message is
    // "fetch failed" and whose cause carries the code.
    const err = new TypeError("fetch failed");
    (err as Error & { cause?: unknown }).cause = Object.assign(
      new Error("getaddrinfo ENOTFOUND d.dicecodes.com"),
      { code: "ENOTFOUND" },
    );

    const text = errorText(err);
    expect(text).toContain("fetch failed");
    expect(text).toContain("ENOTFOUND");
    expect(text).toContain("d.dicecodes.com");

    // And the point of recovering it: the stored record can now diagnose
    // itself, where `.message` could only ever say no_response.
    expect(classifyNetworkError(err.message)).toBe("no_response");
    expect(classifyNetworkError(text)).toBe("dns");
  });

  it("does not repeat a code already in the message", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3000"), {
      code: "ECONNREFUSED",
    });
    const text = errorText(err);
    expect(text.match(/ECONNREFUSED/g)).toHaveLength(1);
  });

  it("handles a string cause, a plain string, and a non-Error", () => {
    const withStringCause = Object.assign(new Error("fetch failed"), {
      cause: "ENOTFOUND",
    });
    expect(errorText(withStringCause)).toBe("fetch failed: ENOTFOUND");
    expect(errorText("already a string")).toBe("already a string");
    expect(errorText({ nope: 1 })).toContain("object");
    expect(errorText(null)).toBe("");
  });

  it("is bounded, because the result is stored and displayed", () => {
    const long = new Error("x".repeat(5000));
    expect(errorText(long).length).toBeLessThanOrEqual(200);
    expect(errorText(long, 40).length).toBeLessThanOrEqual(40);
  });

  it("collapses whitespace so a stack-shaped message stays one line", () => {
    const err = new Error("page.goto: net::ERR_NAME_NOT_RESOLVED\n  at https://x/\n\n  call log:");
    expect(errorText(err)).not.toMatch(/\n/);
  });
});
