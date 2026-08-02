/**
 * The public side of the site grader.
 *
 * This is the one endpoint in the product that anyone on the internet
 * can reach and that makes the server fetch a URL of their choosing.
 * That combination deserves more care than an internal tool:
 *
 *   - SSRF is already handled inside `runAudit`, which refuses private
 *     and reserved addresses and re-checks every redirect hop. Worth
 *     restating because this is the route where it stops being
 *     theoretical.
 *   - Rate limiting exists so an agency's $5 VPS can't be turned into a
 *     free crawler, or pointed at a third party as an amplifier.
 *   - IPs are truncated before they touch the database. A privacy-first
 *     tool should not start accumulating full visitor IPs because
 *     someone added a lead form.
 *
 * The limiter is in-memory. It resets on restart, which means a
 * determined abuser gets a fresh window every time the process cycles —
 * acceptable for the realistic threat (someone hammering the form)
 * rather than a targeted one, and it keeps a marketing widget from
 * needing its own table. Stated rather than hidden.
 */

import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { graderLeads } from "@/db/schema";

/** Grades per IP prefix per window. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

const hits = new Map<string, number[]>();

export function rateLimit(key: string, now = Date.now()): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    const oldest = Math.min(...recent);
    return {
      allowed: false,
      retryAfterSec: Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000),
    };
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic sweep so a long-lived process doesn't accumulate a key
  // for every IP that ever touched the widget.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** Testing hook — the limiter is module state by design. */
export function __resetRateLimit(): void {
  hits.clear();
}

/**
 * Reduce an IP to a network prefix.
 *
 * /24 for IPv4 and /48 for IPv6: enough to recognise one actor coming
 * back, not enough to identify a visitor. Everything downstream — the
 * rate limiter and the stored lead — uses this rather than the address.
 */
export function ipPrefix(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  const first = ip.split(",")[0].trim();
  if (first.includes(":")) {
    // IPv6 — keep the routing prefix, drop the interface identifier.
    return first.split(":").slice(0, 3).join(":") + "::/48";
  }
  const parts = first.split(".");
  if (parts.length !== 4) return "unknown";
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Has this URL already been graded recently?
 *
 * A prospect who refreshes the page three times should be one lead, not
 * three. An inbox full of duplicates is an inbox nobody opens.
 */
export async function recentLeadFor(
  url: string,
  withinMs = 24 * 60 * 60 * 1000,
): Promise<{ id: number } | null> {
  const cutoff = new Date(Date.now() - withinMs);
  const [row] = await db
    .select({ id: graderLeads.id })
    .from(graderLeads)
    .where(and(eq(graderLeads.url, url), gt(graderLeads.createdAt, cutoff)))
    .orderBy(desc(graderLeads.createdAt))
    .limit(1);
  return row ?? null;
}

/** Cheap sanity check. Not validation — the field is optional. */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  return v.length >= 5 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
