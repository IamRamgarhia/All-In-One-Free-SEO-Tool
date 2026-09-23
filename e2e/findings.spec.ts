import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

/**
 * The findings board, and the decision it records.
 *
 * Twenty-nine tools write findings. Until this page the only way to mark
 * one resolved or ignored was the SXO results page, so the rule that
 * matters most about a finding — that a status a person sets survives the
 * next run, which is what stops the agent re-planning work its owner
 * already declined — was almost impossible to exercise, and entirely
 * untested end to end.
 *
 * So this test does not check that the page renders. It checks that
 * clicking a button changes the row in the database, and that the next
 * load agrees. The unit tests cover the carry-forward rule; this covers
 * the only path a person has to trigger it.
 */

const DB = path.resolve(process.cwd(), ".e2e/e2e.db");

const CLIENT = "E2E Findings Ltd";
const SITE = "https://e2e-findings.invalid";

/** Distinctive strings, so a locator cannot match some other fixture. */
const CRITICAL = "The sitemap names a page robots.txt forbids";
const HIGH = "Four pages claim the same canonical";
const DETAIL = "Seen on 4 URLs under /blog/, all pointing at the homepage.";

type Seed = {
  clientId: number;
  runId: number;
  criticalId: number;
  highId: number;
};

function seed(): Seed {
  const db = new Database(DB);
  try {
    db.pragma("journal_mode = WAL");
    db.prepare("DELETE FROM clients WHERE name = ?").run(CLIENT);
    const clientId = Number(
      db
        .prepare("INSERT INTO clients (name, url) VALUES (?, ?)")
        .run(CLIENT, SITE).lastInsertRowid,
    );

    const runId = Number(
      db
        .prepare(
          "INSERT INTO tool_runs (client_id, tool_id, label) VALUES (?, ?, ?)",
        )
        .run(clientId, "robots", "robots and sitemap").lastInsertRowid,
    );

    const insert = db.prepare(
      `INSERT INTO tool_findings
         (run_id, client_id, tool_id, signature, title, severity, details, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`,
    );
    const criticalId = Number(
      insert.run(
        runId,
        clientId,
        "robots",
        "robots.sitemap_blocked",
        CRITICAL,
        "critical",
        null,
      ).lastInsertRowid,
    );
    const highId = Number(
      insert.run(
        runId,
        clientId,
        "robots",
        "robots.canonical_collision",
        HIGH,
        "high",
        DETAIL,
      ).lastInsertRowid,
    );

    // A pass row, which must never appear: a check reporting success is
    // not work, and padding the list with them is how a tool starts
    // looking busy rather than useful.
    insert.run(
      runId,
      clientId,
      "robots",
      "robots.reachable",
      "robots.txt is reachable",
      "pass",
      null,
    );

    return { clientId, runId, criticalId, highId };
  } finally {
    db.close();
  }
}

function statusOf(id: number): string {
  const db = new Database(DB, { readonly: true });
  try {
    const row = db
      .prepare("SELECT status FROM tool_findings WHERE id = ?")
      .get(id) as { status: string } | undefined;
    return row?.status ?? "missing";
  } finally {
    db.close();
  }
}

function unseed() {
  const db = new Database(DB);
  try {
    // The run first, and explicitly. Deleting the client does NOT take it
    // with it: tool_runs.client_id is ON DELETE SET NULL, so the row
    // survives as an ownerless run and keeps feeding the "most used" rail
    // on /tools — which the tools spec then failed on, in a way that
    // looked nothing like this test's fault. Findings cascade from the
    // run, so this clears them too.
    db.prepare("DELETE FROM tool_runs WHERE tool_id = ? AND label = ?").run(
      "robots",
      "robots and sitemap",
    );
    db.prepare("DELETE FROM clients WHERE name = ?").run(CLIENT);
  } finally {
    db.close();
  }
}

let s: Seed;

test.beforeAll(() => {
  s = seed();
});

test.afterAll(() => {
  unseed();
});

/** The row for one finding, found the way a reader would find it. */
function row(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title }).first();
}

test.describe("findings board", () => {
  test("shows what the tools found, and not what passed", async ({ page }) => {
    await page.goto(`/findings/c/${s.clientId}`);

    await expect(row(page, CRITICAL)).toBeVisible();
    await expect(row(page, HIGH)).toBeVisible();

    // Severity is the whole reason for the ordering, so it has to be on
    // screen rather than implied by position.
    await expect(row(page, CRITICAL)).toContainText(/critical/i);
    await expect(row(page, HIGH)).toContainText(/high/i);

    // Details are what make a finding actionable without opening the
    // tool. A title alone is a notification, not a finding.
    await expect(row(page, HIGH)).toContainText(DETAIL);

    await expect(page.getByText("robots.txt is reachable")).toHaveCount(0);
  });

  test("marking one fixed changes the row, and it stays changed", async ({
    page,
  }) => {
    await page.goto(`/findings/c/${s.clientId}`);

    await row(page, CRITICAL).getByRole("button", { name: "Fixed" }).click();

    // The undo affordance appearing is the UI's claim that it worked.
    await expect(
      row(page, CRITICAL).getByRole("button", { name: /Resolved/ }),
    ).toBeVisible();

    // And this is whether the claim is true. A server action that fails
    // quietly would leave the button looking exactly like this.
    await expect(() => expect(statusOf(s.criticalId)).toBe("resolved")).toPass({
      timeout: 10_000,
    });

    // Gone on the next load, because resolved findings are decisions
    // rather than work. The other one must still be there — a bug that
    // resolved everything would pass every assertion above.
    await page.reload();
    await expect(row(page, HIGH)).toBeVisible();
    await expect(page.getByText(CRITICAL)).toHaveCount(0);
    expect(statusOf(s.highId)).toBe("new");
  });

  test("ignoring is undoable, and the undo reaches the database", async ({
    page,
  }) => {
    await page.goto(`/findings/c/${s.clientId}`);

    await row(page, HIGH)
      .getByRole("button", { name: "Not a problem here" })
      .click();
    await expect(() => expect(statusOf(s.highId)).toBe("ignored")).toPass({
      timeout: 10_000,
    });

    await row(page, HIGH).getByRole("button", { name: /Ignored/ }).click();
    await expect(() => expect(statusOf(s.highId)).toBe("new")).toPass({
      timeout: 10_000,
    });

    // An undo that only repaints is worse than no undo: the finding
    // looks live and the agent still treats it as declined.
    await page.reload();
    await expect(row(page, HIGH)).toBeVisible();
  });
});
