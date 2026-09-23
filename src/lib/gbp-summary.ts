/**
 * One line about what the Business Profile check did.
 *
 * Its own file with no imports, for the same reason sweep-summary.ts
 * exists: gbp-monitor.ts reaches the database and Google, and the
 * scheduler wants this at module scope rather than behind the dynamic
 * import that keeps those graphs out of the boot path.
 *
 * The "connect OAuth" line is the one that earns this file. On an
 * install signed in by service account, every run refuses — and a runner
 * that fails identically every twelve hours forever should say what to
 * do about it, not just go red.
 */

export type GbpOutcomeLike = {
  ok: boolean;
  needsScope?: boolean;
  findings?: number;
};

export function summariseGbp(result: unknown): string | null {
  if (!Array.isArray(result) || result.length === 0) return null;
  const rows = result.filter(
    (r): r is GbpOutcomeLike =>
      Boolean(r) && typeof r === "object" && typeof r.ok === "boolean",
  );
  if (rows.length === 0) return null;

  // Every client refused for the same reason. Naming the fix beats
  // reporting the failure count.
  if (rows.every((r) => r.needsScope)) {
    return "Connect Google with OAuth to check Business Profile";
  }

  const findings = rows.reduce((n, r) => n + (r.findings ?? 0), 0);
  const checked = rows.filter((r) => r.ok).length;
  const plural = checked === 1 ? "" : "s";
  return findings > 0
    ? `${checked} profile${plural} checked, ${findings} thing${findings === 1 ? "" : "s"} to do`
    : `${checked} profile${plural} checked, nothing outstanding`;
}
