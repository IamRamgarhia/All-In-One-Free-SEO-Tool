/**
 * One line about what the nightly sweep actually did.
 *
 * Its own file, with no imports, for the same reason `swept-tools.ts`
 * exists: `tool-sweep.ts` opens the database, and the scheduler wants
 * this at module scope rather than behind the dynamic import that keeps
 * every tool's dependency graph out of the boot path.
 *
 * The line matters more than it looks. A runner that finishes without
 * throwing renders as a green tick and "4h ago", and for this runner
 * that was not the same as working: against a client whose site could
 * not be reached it completed every night having run two checks of ten,
 * reported all ten as fine, and recorded nothing anywhere a person would
 * see it.
 */

export type SweepLike = { ok: boolean };

export function summariseSweep(result: unknown): string | null {
  if (!Array.isArray(result)) return null;
  const rows = result.filter(
    (r): r is SweepLike =>
      Boolean(r) && typeof r === "object" && typeof r.ok === "boolean",
  );
  // Nothing ran. Saying "0 of 0 checks ran" reads as a failure when the
  // honest answer is that there were no clients to sweep.
  if (rows.length === 0) return null;

  const ok = rows.filter((r) => r.ok).length;
  if (ok === rows.length) return `${ok} of ${ok} checks ran`;
  // The count that could not run is spelled out rather than left to
  // subtraction. It is the number worth acting on.
  return `${ok} of ${rows.length} checks ran — ${rows.length - ok} could not`;
}

/**
 * Did the sweep only partly work?
 *
 * The companion to summariseSweep, and the reason it exists: a sweep
 * that reaches nothing still returns normally, so the scheduler records
 * a success and the Automations view drew a green tick beside
 * "27 of 38 checks ran — 11 could not". Green and that sentence on the
 * same row is a contradiction the reader has to notice and resolve.
 *
 * Computed from the result rather than by parsing that sentence: a regex
 * over human copy would be a second source of truth about whether the
 * work happened, and the two would drift the first time the wording was
 * improved.
 */
export function sweepDegraded(result: unknown): boolean {
  if (!Array.isArray(result)) return false;
  const rows = result.filter(
    (r): r is SweepLike =>
      Boolean(r) && typeof r === "object" && typeof r.ok === "boolean",
  );
  // No rows is not degraded — there were no clients to sweep, which
  // summariseSweep already reports as nothing rather than as a failure.
  if (rows.length === 0) return false;
  return rows.some((r) => !r.ok);
}
