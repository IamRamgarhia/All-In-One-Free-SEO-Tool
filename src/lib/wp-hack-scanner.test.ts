/**
 * What the malware scanner is allowed to call critical.
 *
 * The scanner does network I/O end to end, so this reads its source the
 * way planner-coverage.test.ts reads the planner's. That is weaker than
 * driving it, and it is what stands between this project and the bug it
 * is written for.
 *
 * On the first real WordPress site this scanner was ever pointed at, the
 * only file it could fetch was readme.html. Every genuine secret was
 * correctly blocked. It reported "1 sensitive file publicly readable —
 * configuration, debug, or version-control files ... anyone can read
 * these right now", severity critical, overall risk compromised.
 *
 * Nothing was wrong with the site. A critical that cries wolf is worse
 * than a missed finding, because it teaches the reader to discount the
 * next one, and the next one is the real compromise.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/lib/wp-hack-scanner.ts"),
  "utf8",
);

/** The paths whose presence is reported as a critical exposure. */
function criticalExposureProbes(): string[] {
  const start = source.indexOf("const exposureProbes = [");
  expect(start, "exposureProbes went away or was renamed").toBeGreaterThan(-1);
  const rest = source.slice(start);
  const literal = rest.slice(0, rest.indexOf("];"));
  return [...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("what counts as a critical exposure", () => {
  it("does not include files that ship with WordPress", () => {
    // readme.html is on every install and holds no secret. It belongs in
    // its own low-severity check, which exists below.
    const shipped = ["readme.html", "license.txt", "wp-includes/version.php"];
    const wrong = criticalExposureProbes().filter((p) => shipped.includes(p));
    expect(
      wrong,
      `${wrong.join(", ")} ships with WordPress and is not a secret, so ` +
        `finding it must not report the site as compromised.`,
    ).toEqual([]);
  });

  it("still probes for the things that are genuinely secrets", () => {
    // Guards the guard. Emptying the list would pass the test above.
    const probes = criticalExposureProbes();
    for (const must of [".env", ".git/config", "wp-content/debug.log"]) {
      expect(probes, `${must} must still be probed`).toContain(must);
    }
    expect(probes.some((p) => p.startsWith("wp-config"))).toBe(true);
  });

  it("reports the WordPress version being readable, at a fair severity", () => {
    // Removing readme.html from the list above must not mean nobody is
    // told about it. Version disclosure is how mass scans build target
    // lists, and it is a tidy-up, not an incident.
    expect(source).toContain('id: "readme-exposed"');
    const block = source.slice(source.indexOf('id: "readme-exposed"'));
    expect(block.slice(0, 200)).toContain('severity: "low"');
  });
});
