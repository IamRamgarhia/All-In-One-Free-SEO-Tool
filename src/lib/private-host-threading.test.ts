import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every fetch on the audit path must be able to reach a private host.
 *
 * This exists because the same bug was found six times in one afternoon,
 * always the same way and never by reading the code:
 *
 *   checkBrokenLinks    broken-link checking silently found nothing
 *   checkSiteWide       robots.txt and sitemap.xml reported as missing
 *                       while being served correctly
 *   fetchRobotsPolicy   robots.txt ignored entirely — the crawler walked
 *                       paths the owner had disallowed
 *   detectTechStack     every wp_*, next_* and shopify_* rule skipped,
 *                       which is the whole tech-specific layer
 *
 * The shape never varies. guardedFetch is called without `allowPrivate`,
 * the guard rejects, a catch turns the rejection into null or a default,
 * and the caller reads that as a real answer. Nothing throws, nothing
 * logs, and the audit reports confidently on checks that never ran.
 *
 * `allowPrivateHosts` exists so an operator can audit their own staging
 * box, a LAN address, or a docker-compose hostname. Those are the exact
 * cases each of these bugs broke.
 *
 * So: any file on the audit path that calls guardedFetch has to be able
 * to pass allowPrivate. This is a coarse check — it cannot prove the
 * flag is threaded from runAudit all the way down — but it makes the
 * omission visible at the point it is written rather than months later.
 */

const AUDIT_PATH_MODULES = [
  "lib/audit.ts",
  "lib/robots-policy.ts",
  "lib/tech-detect.ts",
];

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("private-host support reaches every fetch on the audit path", () => {
  for (const mod of AUDIT_PATH_MODULES) {
    it(`${mod} passes allowPrivate to every guardedFetch`, () => {
      const text = src(mod);
      // Each guardedFetch call, from the opening paren to its matching
      // close. Crude, and enough: the init object is always a literal.
      const calls: string[] = [];
      let i = text.indexOf("guardedFetch(");
      while (i !== -1) {
        let depth = 0;
        let j = i + "guardedFetch".length;
        for (; j < text.length; j++) {
          if (text[j] === "(") depth++;
          else if (text[j] === ")") {
            depth--;
            if (depth === 0) break;
          }
        }
        calls.push(text.slice(i, j + 1));
        i = text.indexOf("guardedFetch(", j);
      }

      expect(calls.length, `no guardedFetch calls found in ${mod}`).toBeGreaterThan(0);

      const missing = calls.filter((c) => !/allowPrivate/.test(c));
      expect(
        missing.map((c) => c.slice(0, 80).replace(/\s+/g, " ")),
        `A guardedFetch in ${mod} does not pass allowPrivate. On a private ` +
          `host the guard rejects it, the surrounding catch turns that into ` +
          `a default, and the caller reports that default as a real result. ` +
          `That exact bug shipped four times.`,
      ).toEqual([]);
    });
  }

  it("runAudit threads allowPrivateHosts into every helper that takes it", () => {
    // The other half: a helper can accept the flag and still be called
    // without it, which is how three of the four shipped.
    const text = src("lib/audit.ts");
    const helpers = [
      "checkBrokenLinks",
      "checkSiteWide",
      "fetchRobotsPolicy",
      "detectTechStack",
    ];
    const unthreaded = helpers.filter((h) => {
      const call = text.slice(text.indexOf(`await ${h}(`));
      if (!call.startsWith(`await ${h}(`)) return true;
      // Look at the call's arguments, not the whole file.
      const end = call.indexOf(");");
      return !/allowPrivate/.test(call.slice(0, end === -1 ? 400 : end));
    });
    expect(
      unthreaded,
      `${unthreaded.join(", ")} accepts a private-host flag but runAudit ` +
        `calls it without one, so the option silently stops at that layer.`,
    ).toEqual([]);
  });
});
