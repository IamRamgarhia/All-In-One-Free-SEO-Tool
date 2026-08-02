import { test, expect } from "@playwright/test";

/**
 * The surfaces built for agencies and freelancers: autopilot, bulk
 * reports, leads, proposals, and the connect hub.
 *
 * These are covered here rather than by the route sweep because the
 * things worth asserting are things only a browser can see — that a
 * safety warning is actually rendered next to the control it warns
 * about, that the embeddable widget carries none of the app's chrome,
 * and that setup guidance is one click from where a user needs it.
 *
 * Written against an empty database on purpose. Every screen here is
 * one a brand-new user meets before they have any data, and the empty
 * state is the state least likely to have been clicked through.
 */

test.describe("autopilot", () => {
  test("defaults to a level that cannot touch a live site", async ({ page }) => {
    await page.goto("/agent/autopilot");

    // The promise the default makes. If this ever flips, an agency's
    // client sites get edited by a setting the user thought was safe —
    // and they'd hear about it from the client, not from us.
    await expect(page.getByText("Suggest only")).toBeVisible();
    await expect(
      page.getByText(/never changes anything/i).first(),
    ).toBeVisible();
  });

  test("shows the guardrails, not just the levels", async ({ page }) => {
    await page.goto("/agent/autopilot");
    await expect(page.getByText("Changes per run")).toBeVisible();
    await expect(page.getByText("Changes per day")).toBeVisible();
    await expect(page.getByText(/Cooldown/i)).toBeVisible();
  });

  test("full autopilot warns before you pick it", async ({ page }) => {
    await page.goto("/agent/autopilot");
    await page.getByRole("button", { name: /Full autopilot/ }).click();
    // The warning has to appear next to the choice, not in a doc
    // somewhere. This is the one level that edits live pages unasked.
    //
    // Scoped to the alert rather than the phrase: the level's own
    // description uses similar wording, so a bare text match hits two
    // elements and proves neither.
    await expect(
      page.getByText(/On this setting the agent rewrites live pages/i),
    ).toBeVisible();
  });
});

test.describe("bulk reports", () => {
  test("explains that batches produce drafts", async ({ page }) => {
    await page.goto("/reports/batch");
    await expect(
      page.getByRole("heading", { name: /Generate all reports/i }),
    ).toBeVisible();
    // The safety property of the whole feature: nothing reaches a client
    // unread.
    await expect(page.getByText(/Nothing goes out until you say so/i)).toBeVisible();
  });
});

test.describe("leads and the embeddable widget", () => {
  test("the leads page hands over a copyable embed snippet", async ({ page }) => {
    await page.goto("/leads");
    await expect(page.getByText(/Put the audit widget on your site/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Copy snippet/i })).toBeVisible();
  });

  test("the widget carries none of the app's chrome", async ({ page }) => {
    await page.goto("/embed/grader");

    await expect(page.getByRole("heading", { name: /Free SEO audit/i })).toBeVisible();
    await expect(page.getByPlaceholder(/yourwebsite\.com/i)).toBeVisible();

    // This renders inside an iframe on a stranger's marketing site. The
    // client portal shipped the agency's whole sidebar in its HTML once
    // — invisible on screen, entirely present in the source — and this
    // is the same failure waiting to happen.
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);
    await expect(page.locator('a[href="/clients"]')).toHaveCount(0);
    await expect(page.locator("[class*=sidebar]")).toHaveCount(0);
  });

  test("asks for the URL before it asks for an email", async ({ page }) => {
    await page.goto("/embed/grader");
    // Value before asking for anything. A form gating the result is the
    // pattern everyone has learned to close.
    await expect(page.getByPlaceholder(/you@company\.com/i)).toHaveCount(0);
  });
});

test.describe("proposals", () => {
  test("offers to build from a client or a lead", async ({ page }) => {
    await page.goto("/proposals");
    // level: 1 — the page title, not the "0 proposals" section heading.
    await expect(
      page.getByRole("heading", { name: "Proposals", level: 1 }),
    ).toBeVisible();
    await expect(page.getByLabel(/From a client/i)).toBeVisible();
    await expect(page.getByLabel(/From a lead/i)).toBeVisible();
  });

  test("says the scope comes from the audit, not from a template", async ({
    page,
  }) => {
    await page.goto("/proposals");
    await expect(page.getByText(/what the audit actually found/i)).toBeVisible();
  });
});

test.describe("connect hub", () => {
  test("lists every integration with a time estimate", async ({ page }) => {
    await page.goto("/connect");

    // Matched as the expandable control, not as loose text. A bare
    // getByText also matches the RSC payload Next inlines in a <script>,
    // which is hidden — so `.first()` was resolving to something the
    // user can never see and the assertion proved nothing.
    for (const name of [
      /An AI provider/,
      /Google Search Console \+ Analytics/,
      /Bing Webmaster Tools/,
      /Email delivery/,
    ]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    // Nobody should start something open-ended.
    await expect(
      page.locator("main").getByText(/~\d+ min/).first(),
    ).toBeVisible();
  });

  test("says what you lose by skipping each one", async ({ page }) => {
    await page.goto("/connect");
    // The honest half of the pitch, and the part that stops this reading
    // as a nag screen.
    await expect(
      page.locator("main").getByText("If you skip it").first(),
    ).toBeVisible();
  });

  test("never claims a connection is required", async ({ page }) => {
    await page.goto("/connect");
    // innerText, not textContent: the latter includes the RSC payload
    // Next inlines in a <script>, so this was asserting against markup
    // the user never sees.
    const visible = await page.locator("main").innerText();

    // CLAUDE.md's rule: the tool is fully usable with no keys at all.
    await expect(
      page.locator("main").getByText(/Nothing here is required/i),
    ).toBeVisible();

    // The phrasings that would break that promise. Deliberately NOT a
    // bare /is required/ — the reassurance above contains those exact
    // words, so the first version of this test contradicted the copy it
    // also asserted was present, and failed on a page that was correct.
    expect(visible).not.toMatch(/\byou (must|need to) (add|connect|set up)\b/i);
    expect(visible).not.toMatch(/\brequires an api key\b/i);
    expect(visible).not.toMatch(/\bwon'?t work without\b/i);
  });

  test("the setup destinations actually resolve", async ({ page }) => {
    // The bug this page was built to fix: the Bing import told people to
    // add their key "in Settings", where it isn't — it's on /tools/bing.
    // A link that 404s or lands on the wrong screen is the same failure
    // in a new place, and nobody reports it as a bug.
    await page.goto("/connect");
    const hrefs = await page
      .locator('a[href^="/"], a[href^="/settings"]')
      .evaluateAll((els) =>
        els
          .map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? "")
          .filter((h) => h.startsWith("/") && !h.startsWith("//")),
      );

    const unique = [...new Set(hrefs)].filter((h) => !h.startsWith("/connect#"));
    expect(unique.length).toBeGreaterThan(0);

    for (const href of unique) {
      const res = await page.request.get(href);
      expect(res.status(), `${href} did not resolve`).toBeLessThan(400);
    }
  });
});
