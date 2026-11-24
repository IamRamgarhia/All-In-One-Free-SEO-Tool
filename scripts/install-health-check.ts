/**
 * Run the install-health checks against the real database and print
 * what they find, in French (default) or English (`--en`).
 *
 * Ported from upstream. Exists because these checks exist to catch
 * silent breakage, and a check that has never run against a genuinely
 * broken install is itself unverified.
 *
 *   SEO_DB_PATH=/tmp/copie.db npx tsx scripts/install-health-check.ts
 *
 * Stores the result by default, so running this also primes the
 * dashboard banner and Settings → System health. `--no-store` keeps it
 * read-only. Run it against a COPY of data.db when in doubt.
 */
import { createTranslator } from "next-intl";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import {
  refreshStoredHealth,
  runHealthChecks,
  sortIssues,
  summariseHealth,
} from "../src/lib/install-health";
import { issueText, type LooseT } from "../src/lib/install-health-text";

const STORE = !process.argv.includes("--no-store");
const LOCALE = process.argv.includes("--en") ? "en" : "fr";

const COLOUR: Record<string, string> = {
  broken: "\x1b[31m",
  stalled: "\x1b[33m",
  idle: "\x1b[90m",
};
const RESET = "\x1b[0m";

async function main() {
  const t = createTranslator({
    locale: LOCALE,
    messages: LOCALE === "en" ? en : fr,
    namespace: "installHealth",
  }) as unknown as LooseT;

  const started = Date.now();
  const issues = STORE
    ? sortIssues((await refreshStoredHealth()).issues)
    : sortIssues(await runHealthChecks());
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nInstall checks ran in ${secs}s${STORE ? " (result stored)" : " (--no-store)"}.\n`);

  if (issues.length === 0) {
    console.log("  No problems found.\n");
    return;
  }

  for (const i of issues) {
    const w = issueText(i, t, {
      toolName: (id) => id,
      formatDate: (iso) => iso.slice(0, 10),
      listFormat: (items) => items.join(", "),
    });
    const c = COLOUR[i.severity] ?? "";
    console.log(`${c}${i.severity.toUpperCase().padEnd(8)}${RESET} ${w.title}`);
    console.log(`         ${w.evidence}`);
    if (w.detail) console.log(`         ${w.detail}`);
    console.log(`         → ${w.fixLabel}: ${i.fixHref}`);
    console.log(`         id: ${i.id}\n`);
  }

  const summary = summariseHealth({ issues, checkedAt: new Date(), neverChecked: false });
  console.log(
    `${issues.length} issue(s); banner: ${
      summary ? `${summary.broken} broken, ${summary.stalled} stalled` : "(nothing shown)"
    }\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
