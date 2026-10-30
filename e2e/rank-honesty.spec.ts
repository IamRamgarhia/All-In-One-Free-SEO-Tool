import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

/**
 * A measurement that failed must not render as a measurement that
 * succeeded.
 *
 * Three fixes landed on 30 Oct 2026 for the same root cause: `checkRank`
 * does not throw, so a captcha comes back as `position: null` with
 * `error` set, and callers that read only `position` could not tell a
 * block from a genuine "not in the results". Unit tests cover the
 * arithmetic — summariseGrid and comparePositions. They cannot cover the
 * part that actually faces the user, which is what gets drawn:
 *
 *   - a grid cell with no answer used to be drawn exactly like a cell
 *     that was checked and found nothing, and `computeDelta` then
 *     labelled it **lost**, in red, against the previous run. One
 *     captcha made the whole heatmap read as a ranking collapse.
 *   - the history list rendered a never-computed null as "0% in pack",
 *     which is a specific confident claim about rankings.
 *   - /tools/serp-volatility averaged position deltas across sources
 *     into a score labelled calm / choppy / stormy, so switching
 *     between Search Console and a scrape reported an algorithm update
 *     that never happened.
 *
 * Seeded directly, because reproducing a block needs Google to serve one
 * and this machine is blocked outright — which is how the bug survived.
 */

const DB = path.resolve(process.cwd(), ".e2e/e2e.db");

const CLIENT = "E2E Rank Honesty Ltd";
const SITE = "https://e2e-rank-honesty.invalid";
const QUERY = "emergency plumber vasant kunj";
const BLOCKED = "Google showed a CAPTCHA.";

type Cell = { lat: number; lng: number; position: number | null; error?: string };

/**
 * A 2x2 grid: one in the local pack, one ranked outside it, one checked
 * and genuinely absent, one blocked.
 *
 * Deliberately mixed. A grid where everything is blocked would pass a
 * test that renders "?" for every cell regardless of the reason, which
 * is the bug written the other way round.
 */
const CELLS: Cell[] = [
  { lat: 28.52, lng: 77.15, position: 2 },
  { lat: 28.52, lng: 77.16, position: 14 },
  { lat: 28.53, lng: 77.15, position: null },
  { lat: 28.53, lng: 77.16, position: null, error: BLOCKED },
];

/** The previous run, where every cell ranked. Makes "lost" possible. */
const PRIOR_CELLS: Cell[] = CELLS.map((c, i) => ({
  lat: c.lat,
  lng: c.lng,
  position: [2, 11, 8, 4][i],
}));

function seed(): { clientId: number } {
  const db = new Database(DB);
  try {
    db.pragma("journal_mode = WAL");
    db.prepare("DELETE FROM clients WHERE name = ?").run(CLIENT);
    const clientId = Number(
      db
        .prepare("INSERT INTO clients (name, url) VALUES (?, ?)")
        .run(CLIENT, SITE).lastInsertRowid,
    );

    const insertGrid = db.prepare(
      `INSERT INTO local_grid_checks
         (client_id, query, center_lat, center_lng, grid_size, spacing_m,
          cells, avg_position, in_pack_pct, ran_at)
       VALUES (?, ?, ?, ?, 2, 1500, ?, ?, ?, ?)`,
    );

    const now = Math.floor(Date.now() / 1000);
    // Older run first: every cell ranked, so the newer run has something
    // to be compared against.
    insertGrid.run(
      clientId,
      QUERY,
      28_520_000,
      77_150_000,
      JSON.stringify(PRIOR_CELLS),
      6,
      50,
      now - 86_400,
    );
    // The run with a blocked cell. in_pack_pct is what summariseGrid now
    // produces: 1 of the 3 cells that answered, not 1 of 4.
    insertGrid.run(
      clientId,
      QUERY,
      28_520_000,
      77_150_000,
      JSON.stringify(CELLS),
      8,
      33,
      now,
    );
    // And a run where nothing could be checked at all, which stores NULL
    // rather than 0.
    insertGrid.run(
      clientId,
      `${QUERY} (all blocked)`,
      28_520_000,
      77_150_000,
      JSON.stringify(CELLS.map((c) => ({ ...c, position: null, error: BLOCKED }))),
      null,
      null,
      now + 60,
    );

    return { clientId };
  } finally {
    db.close();
  }
}

/**
 * Clean up after ourselves.
 *
 * The e2e database persists between runs (reuseExistingServer locally),
 * and specs run in one worker against one SQLite file. Leaving clients
 * behind changes what later specs see — which is how the first run of
 * this file broke an assertion in agency.spec.ts that had quietly
 * depended on there being no clients at all.
 */
function drop(name: string): void {
  const db = new Database(DB);
  try {
    db.pragma("journal_mode = WAL");
    db.prepare("DELETE FROM clients WHERE name = ?").run(name);
  } finally {
    db.close();
  }
}

test.describe("local grid: a blocked cell is not a lost ranking", () => {
  let clientId = 0;

  test.beforeAll(() => {
    clientId = seed().clientId;
  });

  test.afterAll(() => drop(CLIENT));

  test("an unanswered cell is drawn as unknown, not as not-ranking", async ({
    page,
  }) => {
    await page.goto(`/local-grid/c/${clientId}`);

    // Open the run that has the blocked cell. The history list collapses
    // runs; the heatmap renders once expanded.
    await page.getByRole("button", { name: new RegExp(QUERY) }).nth(1).click();

    // The cell with no answer carries its reason, so hovering says why
    // rather than implying a rank.
    const unknown = page.locator(`[title*="no answer"]`).first();
    await expect(unknown).toBeVisible();
    await expect(unknown).toContainText("?");
    await expect(unknown).toHaveAttribute("title", new RegExp(BLOCKED));

    // The legend distinguishes the two. Without this the "?" is just an
    // undocumented glyph.
    await expect(page.getByText(/No answer \(blocked\)/)).toBeVisible();
    await expect(page.getByText("Not ranked", { exact: true })).toBeVisible();
  });

  test("a blocked cell gets no delta against the previous run", async ({
    page,
  }) => {
    await page.goto(`/local-grid/c/${clientId}`);
    await page.getByRole("button", { name: new RegExp(QUERY) }).nth(1).click();

    // This is the assertion the whole fix is for. In the previous run
    // that cell ranked #4; in this one we never found out. The old code
    // printed "lost" in red, which is a claim that a ranking
    // disappeared, made on no evidence.
    const unknown = page.locator(`[title*="no answer"]`).first();
    await expect(unknown).not.toContainText("lost");

    // The cell that really did fall out — checked, and absent — still
    // says so, otherwise this test would pass by suppressing everything.
    const heatmap = page.locator('[title*="not ranked"]').first();
    await expect(heatmap).toContainText("lost");
  });

  test("a run that measured nothing says so instead of 0%", async ({ page }) => {
    await page.goto(`/local-grid/c/${clientId}`);

    // The all-blocked run stores NULL. `?? 0` rendered that as a
    // confident "0% in pack".
    const row = page
      .locator("li")
      .filter({ hasText: "(all blocked)" })
      .first();
    await expect(row).toContainText("not measured");
    await expect(row).not.toContainText("0% in pack");

    // The run that did measure something reports its real share.
    const measured = page.locator("li").filter({ hasText: QUERY }).nth(1);
    await expect(measured).toContainText("% in pack");
  });
});

test.describe("serp volatility: cross-source movement is excluded", () => {
  const VOL_CLIENT = "E2E Volatility Ltd";
  const VOL_QUERY = "e2e cross source keyword";
  const SAME_SOURCE_QUERY = "e2e same source keyword";

  test.beforeAll(() => {
    const db = new Database(DB);
    try {
      db.pragma("journal_mode = WAL");
      db.prepare("DELETE FROM clients WHERE name = ?").run(VOL_CLIENT);
      const clientId = Number(
        db
          .prepare("INSERT INTO clients (name, url) VALUES (?, ?)")
          .run(VOL_CLIENT, "https://e2e-volatility.invalid").lastInsertRowid,
      );
      const keywordId = Number(
        db
          .prepare("INSERT INTO keywords (client_id, query) VALUES (?, ?)")
          .run(clientId, VOL_QUERY).lastInsertRowid,
      );

      const now = Math.floor(Date.now() / 1000);
      const ins = db.prepare(
        `INSERT INTO keyword_rankings (keyword_id, position, checked_at, device, source)
         VALUES (?, ?, ?, 'desktop', ?)`,
      );
      // A Search Console average of 4, then a live scrape of 19. The old
      // code called that a 15-position shift and averaged it into the
      // volatility score, which labels the SERP "stormy" past 15.
      ins.run(keywordId, 4, now - 3600, "gsc");
      ins.run(keywordId, 19, now - 60, "scrape");
    } finally {
      db.close();
    }
  });

  test.afterAll(() => drop(VOL_CLIENT));

  test("names what it excluded rather than scoring it", async ({ page }) => {
    await page.goto("/tools/serp-volatility?days=7");

    // When every keyword is excluded there are no movements at all, so
    // the page takes its empty branch. That branch used to say "no
    // keywords have >=2 rank checks… run rank checks and come back",
    // which is false here and advises the one thing that caused it —
    // this spec is what found that.
    await expect(
      page.getByText(/none can be compared/),
    ).toBeVisible();
    await expect(
      page.getByText(/window starts and ends on different sources/),
    ).toBeVisible();
    await expect(
      page.getByText(/No keywords have ≥2 rank checks/),
    ).toHaveCount(0);

    // And the invented 15-position move is not in a movers list.
    await expect(page.getByText(VOL_QUERY)).toHaveCount(0);
  });

  test("still scores a same-source move, so exclusion is not a blanket", async ({
    page,
  }) => {
    // Guards the other direction: a test that passes because everything
    // is excluded would also pass if the page excluded everything.
    const db = new Database(DB);
    try {
      const row = db
        .prepare("SELECT id FROM clients WHERE name = ?")
        .get(VOL_CLIENT) as { id: number } | undefined;
      if (!row) throw new Error(`${VOL_CLIENT} was not seeded`);
      const clientId = row.id;
      const keywordId = Number(
        db
          .prepare("INSERT INTO keywords (client_id, query) VALUES (?, ?)")
          .run(clientId, SAME_SOURCE_QUERY).lastInsertRowid,
      );
      const now = Math.floor(Date.now() / 1000);
      const ins = db.prepare(
        `INSERT INTO keyword_rankings (keyword_id, position, checked_at, device, source)
         VALUES (?, ?, ?, 'desktop', 'scrape')`,
      );
      ins.run(keywordId, 5, now - 3600);
      ins.run(keywordId, 11, now - 60);
    } finally {
      db.close();
    }

    await page.goto("/tools/serp-volatility?days=7");
    await expect(page.getByText(SAME_SOURCE_QUERY)).toBeVisible();
    // 1 comparable keyword, and the cross-source one still called out.
    await expect(
      page.getByText(/1 excluded — window starts and ends on different sources/),
    ).toBeVisible();
  });
});
