import { readStoredHealth } from "./install-health";

/**
 * What the last health check found wrong with a client's WordPress
 * bridge, or null when it found nothing.
 *
 * WHY THIS IS SHARED: the bridge panel renders in two places — the
 * client page's Site tab and Settings → CMS connections — and both need
 * the same answer. Two copies of "is this connection actually working"
 * is how this install came to show a green "connected" badge for weeks
 * over a site with no plugin installed at all.
 *
 * Reads the STORED health result rather than pinging. A live request
 * here would make every client page wait on somebody else's web server,
 * and the nightly check already asks the question properly.
 *
 * The tradeoff is honest and worth stating: this is as fresh as the last
 * health run. A connection repaired five minutes ago can still show the
 * old failure until the next check — which is why the panel's fix path
 * is "paste the key and save", not "wait for the badge to change". A
 * successful save pings before storing, so it proves itself.
 */
export async function wpBridgeProblem(
  clientId: number,
): Promise<string | null> {
  const health = await readStoredHealth().catch(() => null);
  // neverChecked is not an all-clear, but it is also not evidence of a
  // problem — so it reports null and the badge stays optimistic. The
  // alternative, flagging every bridge as broken until the first health
  // run, would cry wolf on a fresh install.
  if (!health || health.neverChecked) return null;

  const issue = health.issues.find(
    (i) =>
      i.id === `wp_unreachable_${clientId}` ||
      i.id === `wp_no_creds_${clientId}`,
  );
  return issue?.evidence ?? null;
}

/** The same answer for several clients, in one read. */
export async function wpBridgeProblems(
  clientIds: readonly number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const health = await readStoredHealth().catch(() => null);
  if (!health || health.neverChecked) return out;

  for (const id of clientIds) {
    const issue = health.issues.find(
      (i) => i.id === `wp_unreachable_${id}` || i.id === `wp_no_creds_${id}`,
    );
    if (issue?.evidence) out.set(id, issue.evidence);
  }
  return out;
}
