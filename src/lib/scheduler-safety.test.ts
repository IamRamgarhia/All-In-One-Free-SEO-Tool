/**
 * Server actions the scheduler calls must not use Next's cache helpers
 * directly.
 *
 * `revalidatePath` needs the static-generation store, which only exists
 * while a request or a server action is being handled. The daily agent
 * is a bare interval in the Node process, so calling one from there
 * throws `Invariant: static generation store missing`.
 *
 * Three steps had been failing that way every morning since the
 * scheduler was written, and none of them looked broken:
 *
 *   rss.refresh          returned the invariant as its result string.
 *   ai.suggestions       swallowed it per client and reported "ran agent
 *                        for 0 clients" — indistinguishable from having
 *                        nothing to do.
 *   audits.refreshStale  the same swallow, the same reading.
 *
 * Asserted as a property over whatever daily-agent.ts imports, so a step
 * added tomorrow is covered without anyone remembering this file.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const AGENT = path.join(ROOT, "src/lib/daily-agent.ts");

/** The action modules the daily agent pulls in, as repo-relative paths. */
function actionModulesUsedByScheduler(): string[] {
  const src = readFileSync(AGENT, "utf8");
  const specifiers = [
    ...src.matchAll(/import\(\s*["']@\/([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

  return [...new Set(specifiers)]
    .map((spec) => path.join(ROOT, "src", `${spec}.ts`))
    .filter((f) => existsSync(f))
    .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
}

describe("what the scheduler reaches", () => {
  const modules = actionModulesUsedByScheduler();

  it("finds the modules the daily agent imports", () => {
    // Guards the guard: if the scan returns nothing, every assertion
    // below passes without checking anything.
    expect(modules.length).toBeGreaterThan(0);
  });

  it("none of them call revalidatePath directly", () => {
    const offenders: string[] = [];
    for (const rel of modules) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      // safeRevalidatePath contains the substring, so match the bare
      // call rather than the name.
      const bare = src.match(/(?<!safe)\brevalidatePath\s*\(/g) ?? [];
      if (bare.length > 0) {
        offenders.push(`${rel} (${bare.length} call${bare.length === 1 ? "" : "s"})`);
      }
    }
    expect(
      offenders,
      `these throw when the scheduler calls them, and the step that does ` +
        `usually swallows it:\n  ${offenders.join("\n  ")}\n` +
        `Use safeRevalidatePath from @/lib/safe-revalidate instead.`,
    ).toEqual([]);
  });

  it("none of them import the raw helper either", () => {
    // Importing it without calling it is how the next one starts.
    for (const rel of modules) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(
        /import\s*\{[^}]*\brevalidatePath\b[^}]*\}\s*from\s*["']next\/cache["']/.test(
          src,
        ),
        `${rel} imports revalidatePath from next/cache`,
      ).toBe(false);
    }
  });
});
