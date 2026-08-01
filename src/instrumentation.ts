/**
 * Next.js runs this once per server process, at boot, before any
 * request is handled. It is the correct hook for starting background
 * work that must not depend on a user visiting a page.
 *
 * This is what makes the automation actually automatic: the scheduler
 * used to be kicked off from the dashboard component, so a self-hosted
 * instance that nobody opened did nothing at all — no rank checks, no
 * page monitoring, no alerts, no scheduled reports, no weekly digest.
 */
export async function register() {
  // Guard on runtime: this file is also evaluated for the edge runtime,
  // where better-sqlite3 and the browser pool don't exist.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  } catch (err) {
    // Never let a scheduler problem stop the server from serving. A
    // half-built install (missing native module) should still render
    // the UI so the user can see what's wrong.
    console.error("[instrumentation] scheduler failed to start:", err);
  }
}
