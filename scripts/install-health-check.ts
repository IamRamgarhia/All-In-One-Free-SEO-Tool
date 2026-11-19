/**
 * Run the install-health checks against the real database and print
 * what they find.
 *
 * Exists because these checks exist to catch silent breakage, and a
 * check that has never run against a genuinely broken install is itself
 * unverified. On the maintainer's machine on 19 Nov 2026 there were five
 * known problems, every one of which the app had noticed and none of
 * which it had said out loud:
 *
 *   - the WordPress plugin missing on dicecodes.com for 68 days
 *   - a Google account holding zero Search Console properties
 *   - 14 fixes queued, oldest 67.7 days
 *   - 115 tasks open, none ever completed
 *   - 24 keywords tracked, 18 positions ever recorded
 *
 * If this prints fewer than those, the checks are the thing that is
 * broken.
 *
 *   pnpm exec tsx scripts/install-health-check.ts
 *
 * Read-only apart from the stored-result write, which --no-store skips.
 */
import {
  refreshStoredHealth,
  runHealthChecks,
  sortIssues,
  summariseHealth,
} from "../src/lib/install-health";

/**
 * Stores the result by default, so running this also primes the
 * dashboard banner and the health page. `--no-store` keeps it read-only.
 */
const STORE = !process.argv.includes("--no-store");

const COLOUR: Record<string, string> = {
  broken: "\x1b[31m",
  stalled: "\x1b[33m",
  idle: "\x1b[90m",
};
const RESET = "\x1b[0m";

async function main() {
  const started = Date.now();
  const issues = STORE
    ? sortIssues((await refreshStoredHealth()).issues)
    : sortIssues(await runHealthChecks());
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(
    `\nRan every install check in ${secs}s${STORE ? " (result stored)" : " (--no-store)"}.\n`,
  );

  if (issues.length === 0) {
    console.log("  No problems found.\n");
    console.log(
      "  Treat that with suspicion until you have seen this script " +
        "report a problem you planted.\n",
    );
    return;
  }

  for (const i of issues) {
    const c = COLOUR[i.severity] ?? "";
    console.log(`${c}${i.severity.toUpperCase().padEnd(8)}${RESET} ${i.title}`);
    console.log(`         ${i.evidence}`);
    console.log(`         → ${i.fixLabel}: ${i.fixHref}`);
    console.log(`         id: ${i.id}`);
    console.log();
  }

  const bySeverity = (s: string) => issues.filter((i) => i.severity === s).length;
  console.log(
    `${issues.length} issue(s): ${bySeverity("broken")} broken, ` +
      `${bySeverity("stalled")} stalled, ${bySeverity("idle")} idle.`,
  );
  const summary = summariseHealth({
    issues,
    checkedAt: new Date(),
    neverChecked: false,
  });
  console.log(`Banner would say: ${summary ?? "(nothing)"}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
