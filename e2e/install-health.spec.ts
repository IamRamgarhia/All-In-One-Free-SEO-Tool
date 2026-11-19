import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

/**
 * The dashboard banner that says this install is not working.
 *
 * Why this is worth an end-to-end test rather than unit coverage alone:
 * the whole feature exists because the app already KNEW about five
 * broken things and told nobody — the information was in agent run
 * summaries and a settings sub-page the entire time. A monitoring
 * feature that silently stops rendering reproduces that bug exactly,
 * one level up, and would be invisible to any test that only checks the
 * module's return value.
 *
 * So this asserts what the PAGE SAYS, and it asserts the three states
 * separately, because the dangerous one is the third:
 *
 *   1. real problems stored      -> the banner names them, with evidence
 *   2. nothing stored at all     -> no banner, and health page says
 *                                  "not checked", NOT "all clear"
 *   3. only `idle` items stored  -> no banner, because a permanent
 *                                  banner is an ignored banner
 *
 * Seeds and removes its own `install_health.last` row. The .e2e database
 * persists between runs and every spec shares one worker and one SQLite
 * file, so a spec that leaves rows behind changes what later specs see —
 * this suite is verified by running it twice against the same file.
 */

const DB = path.resolve(process.cwd(), ".e2e/e2e.db");
const KEY = "install_health.last";
/**
 * `/` redirects to /welcome while no client exists and the first-run
 * gate has not been dismissed, so the dashboard — and the banner on it —
 * never rendered at all. The first version of this spec failed on that
 * for the two tests that assert the banner IS there, and PASSED
 * vacuously for the ones that assert it is not: "not.toContainText" is
 * trivially true on the onboarding page.
 *
 * Fixed by dismissing the gate rather than seeding a client. Seeding a
 * client is what broke agency.spec.ts once already — it asserted on text
 * that is also a per-client <option>, so it only passed on an empty
 * database. One shared SQLite file means a fixture is everyone's
 * fixture.
 *
 * Removed again in afterAll so the rest of the suite sees the state it
 * expects.
 */
const GATE_KEY = "onboarding.dismissed_at";

/**
 * Proof the dashboard actually rendered, so absence means something.
 *
 * NOT the greeting headline. The dashboard has two variants and picks on
 * `clientCount === 0`: a returning user sees "<greeting>, here's what
 * needs attention today", a fresh workspace sees "Welcome. Let's set up
 * your first 5 minutes." The e2e database has no clients, so it is
 * always the second — and asserting the first failed while the page was
 * rendering perfectly well. This strip is in the hero of both.
 */
const DASHBOARD_MARKER = "everything on this machine";

/** Distinctive enough that a locator cannot match real content. */
const BROKEN_TITLE = "E2E Fixture Co: the WordPress plugin is not responding";
const BROKEN_EVIDENCE = 'answered: {"code":"rest_no_route"} e2e-fixture-marker';
const STALLED_TITLE = "7 approved fixes waiting to be applied";
const IDLE_TITLE = "E2E Idle Co has never been audited successfully";

type StoredIssue = {
  id: string;
  severity: "broken" | "stalled" | "idle";
  title: string;
  evidence: string;
  fixHref: string;
  fixLabel: string;
};

/** What the module stores, written directly so no scheduler run is needed. */
function store(issues: StoredIssue[]) {
  const db = new Database(DB);
  try {
    db.prepare(
      `insert into workspace_settings (key, value, updated_at)
       values (?, ?, unixepoch())
       on conflict(key) do update set value = excluded.value, updated_at = unixepoch()`,
    ).run(KEY, JSON.stringify({ at: new Date().toISOString(), issues }));
  } finally {
    db.close();
  }
}

function clear() {
  const db = new Database(DB);
  try {
    db.prepare("delete from workspace_settings where key = ?").run(KEY);
  } finally {
    db.close();
  }
}

function setSetting(key: string, value: unknown) {
  const db = new Database(DB);
  try {
    db.prepare(
      `insert into workspace_settings (key, value, updated_at)
       values (?, ?, unixepoch())
       on conflict(key) do update set value = excluded.value, updated_at = unixepoch()`,
    ).run(key, JSON.stringify(value));
  } finally {
    db.close();
  }
}

function deleteSetting(key: string) {
  const db = new Database(DB);
  try {
    db.prepare("delete from workspace_settings where key = ?").run(key);
  } finally {
    db.close();
  }
}

const brokenIssue: StoredIssue = {
  id: "wp_unreachable_9901",
  severity: "broken",
  title: BROKEN_TITLE,
  evidence: BROKEN_EVIDENCE,
  fixHref: "/clients",
  fixLabel: "Check the connection",
};

const stalledIssue: StoredIssue = {
  id: "fix_queue_stale",
  severity: "stalled",
  title: STALLED_TITLE,
  evidence: "The oldest has waited 41 days. e2e-fixture-marker",
  fixHref: "/agent",
  fixLabel: "Review and apply",
};

const idleIssue: StoredIssue = {
  id: "never_audited_9902",
  severity: "idle",
  title: IDLE_TITLE,
  evidence: "No findings to act on yet. e2e-fixture-marker",
  fixHref: "/clients",
  fixLabel: "Run the first audit",
};

test.beforeAll(() => {
  setSetting(GATE_KEY, new Date().toISOString());
});

test.afterAll(() => {
  clear();
  deleteSetting(GATE_KEY);
});

test.describe("install health banner", () => {
  test("names the broken connection and shows its evidence", async ({ page }) => {
    store([brokenIssue, stalledIssue]);
    await page.goto("/");

    const main = page.locator("main");
    await expect(main).toContainText("Some of this install is not working");
    await expect(main).toContainText(BROKEN_TITLE);

    // The evidence string specifically. A banner that says "integration
    // unhealthy" is the warning everyone ignores; "rest_no_route" is
    // what tells someone the plugin is not activated, and it has to
    // survive all the way to the page.
    await expect(main).toContainText("rest_no_route");

    // And the way out.
    await expect(
      main.getByRole("link", { name: /Check the connection/ }).first(),
    ).toBeVisible();
  });

  test("a stalled-only install reads as stalled, not broken", async ({ page }) => {
    // Different headline, because "not working" and "nothing is coming
    // out of it" need different responses from the reader.
    store([stalledIssue]);
    await page.goto("/");

    const main = page.locator("main");
    await expect(main).toContainText("Work is being found but not finished");
    await expect(main).toContainText(STALLED_TITLE);
    await expect(main).not.toContainText("Some of this install is not working");
  });

  test("idle items alone show no banner", async ({ page }) => {
    // A client you have not audited yet is not a fault. If this ever
    // starts showing, the banner becomes permanent furniture and stops
    // being read — which puts the product back where it started.
    store([idleIssue]);
    await page.goto("/");

    const main = page.locator("main");
    // Prove we are looking at the dashboard FIRST. Without this the
    // three assertions below pass on any page that lacks the text —
    // including the onboarding page this route redirects to on a fresh
    // database, which is exactly how they passed while the feature was
    // not rendering at all.
    await expect(main).toContainText(DASHBOARD_MARKER);
    await expect(main).not.toContainText("Some of this install is not working");
    await expect(main).not.toContainText("Work is being found but not finished");
    await expect(main).not.toContainText(IDLE_TITLE);
  });

  test("with nothing stored, the health page says not-checked rather than all-clear", async ({
    page,
  }) => {
    // The single most important assertion here. "We have not looked" and
    // "nothing is wrong" rendering the same thing IS the class of bug
    // this feature was built to kill, so it must not be reintroduced by
    // the feature itself.
    clear();
    await page.goto("/settings/health");

    const main = page.locator("main");
    await expect(main).toContainText("Install checks have not run yet");
    await expect(main).not.toContainText("Every connection answered");

    await page.goto("/");
    const dash = page.locator("main");
    await expect(dash).toContainText(DASHBOARD_MARKER);
    await expect(dash).not.toContainText("Some of this install is not working");
  });

  test("the health page lists everything, including the idle items the banner hides", async ({
    page,
  }) => {
    store([brokenIssue, stalledIssue, idleIssue]);
    await page.goto("/settings/health");

    const main = page.locator("main");
    await expect(main).toContainText("Is this install working?");
    await expect(main).toContainText(BROKEN_TITLE);
    await expect(main).toContainText(STALLED_TITLE);
    // The banner drops these; the full page must not.
    await expect(main).toContainText("Not set up yet");
    await expect(main).toContainText(IDLE_TITLE);
  });
});
