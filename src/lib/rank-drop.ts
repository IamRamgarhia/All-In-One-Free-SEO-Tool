/**
 * Whether a new ranking is a drop worth acting on: five places or more,
 * or out of the top 10 (including out of the results altogether). The
 * two "rank drop" automation templates promise exactly these.
 *
 * Pure.
 */
export function isRankDrop(previous: number | null, next: number | null): boolean {
  if (previous === null) return false;
  if (next !== null && next - previous >= 5) return true;
  return previous <= 10 && (next === null || next > 10);
}
