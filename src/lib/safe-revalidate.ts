import { revalidatePath } from "next/cache";

/**
 * `revalidatePath` that survives being called outside a request.
 *
 * Next's cache functions need the static-generation store, which only
 * exists while a request or a server action is being handled. The
 * scheduler is neither — it is a bare interval in the Node process — so
 * calling one from there throws:
 *
 *     Invariant: static generation store missing in revalidatePath /news
 *
 * Three of the daily agent's steps call server actions that end with a
 * revalidate, and all three had been failing every morning since the
 * scheduler was written. The way they failed is the interesting part:
 *
 *   rss.refresh        reported the invariant as its result, where
 *                      nobody reads it. The news feed had never
 *                      refreshed in the background.
 *   ai.suggestions     loops clients and swallows per-client errors, so
 *                      it reported "ran agent for 0 clients" — which
 *                      reads as "there was nothing to do" rather than
 *                      "every one of them threw".
 *   audits.refreshStale  the same swallow, the same reading.
 *
 * Swallowing the throw here is safe in a way swallowing it there was
 * not. Inside a request, `revalidatePath` does not fail for a path that
 * exists, so the catch is unreachable in the case that matters. Outside
 * one, there is no rendered page to invalidate and nothing is lost — the
 * scheduler's job is to change the data, and the next request renders it
 * fresh regardless.
 */
export function safeRevalidatePath(
  path: string,
  type?: "layout" | "page",
): void {
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  } catch {
    // No request context. See above — there is nothing to invalidate.
  }
}
