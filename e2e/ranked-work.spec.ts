import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";

/**
 * The ranked list, in a browser, with data behind it.
 *
 * The rest of the E2E suite asserts that pages render without a server
 * error. That caught none of the bugs found while this feature was
 * built, and could not have: every one of them rendered a perfectly
 * healthy page that said the wrong thing. A panel with invisible borders
 * on a light background, a client's name repeated on every row of that
 * client's own page, a blocker ranked tenth beneath a five-minute
 * keyword check.
 *
 * So these assert what the page SAYS, and how it looks, rather than that
 * it exists.
 *
 * Data is seeded straight into the throwaway E2E database rather than
 * through the add-client dialog, which fetches the real site to
 * auto-extract branding and takes about ten seconds. Adding a network
 * round-trip to a fake domain would make every test here flaky for
 * reasons that have nothing to do with what they check.
 */

const DB = path.resolve(process.cwd(), ".e2e/e2e.db");

/** Distinctive enough that a filter can find only this client's rows. */
const CLIENT = "E2E Ranked Work Ltd";
const SITE = "https://e2e-ranked-work.invalid";

function seed(): number {
  const db = new Database(DB);
  try {
    db.pragma("journal_mode = WAL");
    db.prepare("DELETE FROM clients WHERE name = ?").run(CLIENT);
    const info = db
      .prepare("INSERT INTO clients (name, url) VALUES (?, ?)")
      .run(CLIENT, SITE);
    const clientId = Number(info.lastInsertRowid);

    // Two keywords, never rank-checked. That is one of the signals the
    // ranked list reports, and it belongs to the agent rather than to a
    // person — which is what makes the owner split visible.
    for (const q of ["e2e ranked work", "ranked work testing"]) {
      db.prepare(
        "INSERT INTO keywords (client_id, query) VALUES (?, ?)",
      ).run(clientId, q);
    }
    return clientId;
  } finally {
    db.close();
  }
}

function unseed() {
  const db = new Database(DB);
  try {
    db.prepare("DELETE FROM clients WHERE name = ?").run(CLIENT);
  } finally {
    db.close();
  }
}

let clientId: number;

test.beforeAll(() => {
  clientId = seed();
});

test.afterAll(() => {
  unseed();
});

/** The ranked panel, found the way a reader would find it. */
function panel(page: Page) {
  return page
    .locator("section")
    .filter({ hasText: "Ranked by what it changes" })
    .first();
}

test.describe("the ranked list", () => {
  test("names the work, the reason, and the evidence for it", async ({
    page,
  }) => {
    await page.goto("/morning");
    const p = panel(page);
    await expect(p).toBeVisible();

    // A client with no audit has exactly one thing worth doing, and the
    // list has to say so rather than showing an empty box.
    const row = p.getByRole("link").filter({ hasText: CLIENT }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/first audit/i);

    // The three things every row carries. The evidence line is the one
    // that makes the ordering arguable instead of magic, and it is the
    // easiest to lose in a refactor because nothing breaks without it.
    await expect(row).toContainText(/no completed audit/i);
    await expect(row).toContainText(/\d+m/);
  });

  test("splits the work by who does it", async ({ page }) => {
    // The whole premise. A single merged list answers neither question a
    // person actually has when they open this.
    await page.goto("/morning");
    const p = panel(page);
    await expect(p.getByText(/the agent can do these/i)).toBeVisible();
    await expect(p.getByText(/no decision needed from you/i)).toBeVisible();
  });

  test("puts a blocker above ordinary work", async ({ page }) => {
    // Ranking on impact-against-effort alone put "we cannot reach this
    // site at all" beneath a five-minute keyword check — an
    // arithmetically defensible order and a useless list. The first
    // audit is the same class: nothing below it means anything.
    await page.goto("/morning");
    const titles = await panel(page).getByRole("link").allInnerTexts();
    const ours = titles.filter((t) => t.includes(CLIENT));
    expect(ours.length).toBeGreaterThan(0);
    expect(ours[0]).toMatch(/first audit/i);
  });

  test("is visible against the page, in whichever theme", async ({ page }) => {
    // The bug a smoke test cannot see. The panel first shipped with
    // white-alpha borders, which are invisible on a light background —
    // it rendered perfectly and had no container at all.
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/morning");
      const p = panel(page);
      await expect(p).toBeVisible();

      const seen = await p.evaluate((el) => {
        // Resolved on a canvas rather than parsed. This theme's tokens
        // compute to lab() and oklch(), and pulling the numbers out of
        // those strings and treating them as RGB produces confident
        // nonsense — which is what the first version of this test did.
        // Painting each colour and reading the pixel back is correct for
        // every colour space, and does the alpha compositing too.
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        /** The colour you actually see when `fg` is painted over `bg`. */
        const paint = (fg: string, bg: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 1, 1);
          ctx.fillStyle = fg;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return { r, g, b, css: `rgb(${r},${g},${b})` };
        };
        const lum = (c: { r: number; g: number; b: number }) =>
          0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

        const s = getComputedStyle(el);
        // Opaque white underneath, so a page background that is itself
        // translucent still resolves to something real.
        const page = paint(
          getComputedStyle(document.body).backgroundColor,
          "#ffffff",
        );
        const panel = paint(s.backgroundColor, page.css);
        const border = paint(s.borderTopColor, panel.css);

        return {
          fromPage: Math.abs(lum(panel) - lum(page)),
          borderEdge: Math.abs(lum(border) - lum(panel)),
        };
      });

      // Either edge will do — a filled panel or a drawn border. Four
      // points of luminance is a subtle but genuinely visible boundary;
      // the shipped bug measured about 0.3.
      const MIN = 4;
      expect(
        Math.max(seen.fromPage, seen.borderEdge),
        `${scheme}: the panel has no visible edge — background differs from ` +
          `the page by ${seen.fromPage.toFixed(1)} and its border by ` +
          `${seen.borderEdge.toFixed(1)}, both under ${MIN}`,
      ).toBeGreaterThan(MIN);
    }
  });
});

test.describe("a client's own page", () => {
  test("does not repeat the client's name on every row", async ({ page }) => {
    // On that client's own page the name is the one thing the reader
    // already knows, and it crowded out the part they did not.
    await page.goto(`/clients/${clientId}`);
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p).not.toContainText(CLIENT);
  });

  test("every tool link carries the client it is for", async ({ page }) => {
    // A tool opened without one records its findings against nobody, so
    // they reach neither the agent nor this list — while still rendering
    // correctly on the tool's own page, which is why it went unnoticed.
    await page.goto(`/clients/${clientId}`);
    const hrefs = await page
      .locator(`a[href^="/tools/"]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));

    expect(hrefs.length).toBeGreaterThan(0);
    const orphans = hrefs.filter((h) => !/[?&]clientId=/.test(h));
    expect(
      orphans,
      `these would record against no client:\n  ${orphans.join("\n  ")}`,
    ).toEqual([]);
  });
});
