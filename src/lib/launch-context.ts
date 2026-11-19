/**
 * How this server was started — browser tab, or inside the desktop app.
 *
 * WHY THIS EXISTS: the Windows host has always set `SEO_LAUNCHED_BY`
 * and nothing had ever read it. So the app could not tell a browser
 * from its own window, and offered the desktop user this, inside the
 * installed desktop application:
 *
 *     Make SEO Tool feel like a real app
 *       Install as app (PWA)          [Not available]
 *       Desktop & Start Menu shortcut [Create shortcuts]
 *
 * It IS the real app. It was launched from the Start Menu shortcut it
 * was offering to create, and the PWA button it rendered says "Not
 * available" because WebView2 has no install prompt. Every line of it
 * was wrong, in the one place it could not possibly be right.
 *
 * Read on the SERVER. The host sets the variable on the node process it
 * spawns, so the answer is known before anything renders — no flash of
 * a prompt that then disappears, and no client-side sniffing of a user
 * agent that WebView2 deliberately makes look like Edge.
 */

/** Values the launchers set. Unknown or unset means a browser. */
export type LaunchedBy = "windows-host" | "browser";

export function launchedBy(): LaunchedBy {
  return process.env.SEO_LAUNCHED_BY === "windows-host"
    ? "windows-host"
    : "browser";
}

/**
 * True when the UI is inside the native desktop window.
 *
 * Use this to hide things that only make sense in a browser tab:
 * install-as-app prompts, "create a shortcut" offers, instructions to
 * bookmark the URL. NOT for hiding anything about capability — the
 * desktop app runs the same server with the same features, and a page
 * that behaves differently in the two is a bug rather than a polish.
 */
export function isDesktopApp(): boolean {
  return launchedBy() === "windows-host";
}
