/**
 * The app has to know whether it is in a browser tab or its own window.
 *
 * WHY: the Windows host has always set `SEO_LAUNCHED_BY=windows-host`
 * and nothing had ever read it. So inside the installed desktop
 * application the app offered:
 *
 *     Make SEO Tool feel like a real app
 *       Install as app (PWA)          [Not available]
 *       Desktop & Start Menu shortcut [Create shortcuts]
 *
 * It IS the real app. It was launched from the Start Menu shortcut it
 * was offering to create, and the PWA button rendered "Not available"
 * because WebView2 has no install prompt. Every line wrong, in the one
 * place it could not be right.
 *
 * The same blindness made "Stop server" actively harmful there: it
 * kills the server this window depends on, then said "launch it again
 * from your desktop shortcut" — telling someone to start a second copy
 * of the app they are looking at.
 *
 * Read on the SERVER rather than sniffed from a user agent, because
 * WebView2 deliberately identifies as Edge and a client-side check
 * would flash the prompt before hiding it.
 */

import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDesktopApp, launchedBy } from "./launch-context";

const original = process.env.SEO_LAUNCHED_BY;
afterEach(() => {
  if (original === undefined) delete process.env.SEO_LAUNCHED_BY;
  else process.env.SEO_LAUNCHED_BY = original;
});

describe("launch context", () => {
  it("recognises the Windows desktop host", () => {
    process.env.SEO_LAUNCHED_BY = "windows-host";
    expect(launchedBy()).toBe("windows-host");
    expect(isDesktopApp()).toBe(true);
  });

  it("treats anything else as a browser", () => {
    // Unset is the common case — Docker, a dev server, `pnpm start`.
    delete process.env.SEO_LAUNCHED_BY;
    expect(isDesktopApp()).toBe(false);

    // And an unrecognised launcher must not be guessed at. Hiding the
    // install prompt from a browser user is a worse failure than
    // showing it: they would have no way to create a shortcut at all.
    process.env.SEO_LAUNCHED_BY = "some-future-launcher";
    expect(isDesktopApp()).toBe(false);
    expect(launchedBy()).toBe("browser");
  });

  it("the value matches what the host actually sets", () => {
    // The string lives in two files that ship separately — the C# host
    // and this module — so a typo in either silently restores the bug.
    const host = readFileSync(
      join(process.cwd(), "installer/host/SeoToolHost.cs"),
      "utf8",
    );
    expect(host).toContain('"SEO_LAUNCHED_BY"');
    expect(host).toContain('"windows-host"');
  });
});

describe("the surfaces that depend on it", () => {
  it("the install prompt is gated in the layout", () => {
    const layout = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/!isDesktopApp\(\)\s*&&\s*<FirstRunPrompt/);
  });

  it("the power widget is told which mode it is in", () => {
    const layout = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/<PowerWidget isDesktopApp=\{isDesktopApp\(\)\}/);

    const widget = readFileSync(
      join(process.cwd(), "src/components/shell/power-widget.tsx"),
      "utf8",
    );
    // The shortcut entry is hidden...
    expect(widget).toMatch(/!isDesktopApp && \(/);
    // ...and stopping the server no longer tells a desktop user to
    // launch a second copy of the app they are looking at.
    //
    // Asserted as two facts rather than one regex spanning both: the
    // explanatory comment between them is longer than any sane
    // distance limit, and a test that fails because a comment grew is
    // a test people learn to delete.
    expect(widget, "the stop dialog is not mode-aware").toMatch(
      /confirmDialog\(\{[\s\S]{0,200}isDesktopApp/,
    );
    expect(widget).toContain("close the window");
  });
});

