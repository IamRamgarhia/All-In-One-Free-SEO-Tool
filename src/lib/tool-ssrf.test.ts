/**
 * No tool fetches a user-supplied URL without the guard.
 *
 * These run on the server, so "fetch this URL" means "make my server
 * open a connection to wherever this string points" — including
 * 169.254.169.254 for cloud credentials, or a router's admin page. The
 * guard existed and fourteen files used it; eleven tools did not, and
 * nothing about that was visible from the outside.
 *
 * It matters more now than it did: the nightly sweep fetches on a
 * schedule rather than only when somebody clicks.
 *
 * Asserted as a property over the tools directory, so a tool added
 * tomorrow is covered without anyone remembering this file exists.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TOOLS = path.resolve(__dirname, "../app/tools");

/**
 * Fetches allowed to skip the guard, and why.
 *
 * Only fixed third-party hosts belong here: the user's input reaches
 * them as an encoded query parameter, never as the host, so there is no
 * address for an attacker to choose. Anything that fetches a host built
 * from user input must go through the guard, whatever it is called.
 */
const FIXED_HOST_ONLY = new Set([
  "reddit-research", // www.reddit.com search API
  "wayback", // web.archive.org CDX API
]);

function serverFiles(tool: string): { file: string; text: string }[] {
  const dir = path.join(TOOLS, tool);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({
      file: `${tool}/${f}`,
      text: readFileSync(path.join(dir, f), "utf8"),
    }));
}

/** A bare fetch( that isn't guardedFetch( — the thing being banned. */
function rawFetchCount(text: string): number {
  // Strip the guarded form first so its own "fetch(" doesn't match.
  const stripped = text.replace(/guardedFetch\(/g, "GUARDED(");
  return (stripped.match(/(?<![.\w])fetch\(/g) ?? []).length;
}

const tools = readdirSync(TOOLS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("tools that fetch user-supplied URLs", () => {
  it("finds the tools directory", () => {
    expect(tools.length).toBeGreaterThan(50);
  });

  it("never calls bare fetch() on a host the user chose", () => {
    const offenders: string[] = [];
    for (const tool of tools) {
      if (FIXED_HOST_ONLY.has(tool)) continue;
      for (const { file, text } of serverFiles(tool)) {
        const raw = rawFetchCount(text);
        if (raw === 0) continue;
        // A raw fetch is allowed only when the same file guards the URL
        // itself first — the redirect tracer and the http→https check
        // both need to see a 3xx, which guardedFetch collapses away.
        if (/\bguardUrl\(/.test(text)) continue;
        offenders.push(`${file} (${raw} bare fetch call${raw === 1 ? "" : "s"})`);
      }
    }
    expect(
      offenders,
      `these reach whatever host the user types, with no SSRF guard:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the tools that trace redirects themselves still guard every hop", () => {
    // guardedFetch follows redirects internally, so these two use
    // guardUrl + a manual fetch instead. Guarding only the first URL
    // would leave the standard bypass open: a public URL that redirects
    // into private space.
    for (const tool of ["headers", "domain-overview"]) {
      const text = serverFiles(tool)
        .map((f) => f.text)
        .join("\n");
      expect(text, `${tool} should guard before its manual fetch`).toMatch(
        /guardUrl\(/,
      );
      expect(text, `${tool} should still fetch manually`).toMatch(
        /redirect:\s*"manual"/,
      );
    }
  });
});
