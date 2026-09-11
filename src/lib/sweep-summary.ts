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
