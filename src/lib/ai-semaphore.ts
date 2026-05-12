/**
 * Process-wide AI call concurrency limit.
 *
 * Why this exists:
 * Every AI feature in the app — daily-agent generation, audit summaries,
 * SEO chat, ad-funnel architect, blog writer, etc. — goes through
 * `callAI()`. Without a workspace-wide gate, the following will happen:
 *
 *   06:00  daily-agent ticks, queues 8 client-blog drafts sequentially
 *   06:00  user opens the AI agent chat and asks a question
 *   06:00  user clicks "Generate ad strategy" in the ad-funnel tool
 *
 * Three concurrent requests on a free Gemini tier (~15 RPM, 2-3 RPS
 * burst) trips a 429 on at least one. That 429 surfaces as
 * "AI provider didn't respond" which kills the user's manual action
 * even though the automation was the cause.
 *
 * Fix: a tiny semaphore with N permits (default 2). Permits are
 * acquired by `withAiPermit(fn)`; queued callers wait their turn.
 * On error the permit is released in finally so a thrown call never
 * leaks a slot.
 *
 * Why 2 and not 1: lets the user's manual action go through while a
 * single automation step is in flight. Why not 5+: free-tier rate
 * limits + free-tier per-key concurrency on most providers cap us at
 * ~2-3 anyway. Configurable via the AI_MAX_CONCURRENCY env var when
 * the user is on a paid plan.
 */

const DEFAULT_MAX_CONCURRENCY = 2;

let MAX_CONCURRENCY = (() => {
  const raw = process.env.AI_MAX_CONCURRENCY;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : DEFAULT_MAX_CONCURRENCY;
})();

let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < MAX_CONCURRENCY) {
      active++;
      resolve();
      return;
    }
    queue.push(() => {
      active++;
      resolve();
    });
  });
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

/**
 * Acquire a permit, run `fn`, release the permit. Always releases
 * even when `fn` throws — try/finally guarantees no slot leak.
 *
 * Use this around every AI provider dispatch in `callAI`. The
 * existing per-call timeout still applies inside `fn`.
 */
export async function withAiPermit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/**
 * Debug snapshot. Returns the current in-flight count + waiting count.
 * Used by /api/health to surface AI back-pressure to operators.
 */
export function aiSemaphoreStats(): {
  active: number;
  waiting: number;
  max: number;
} {
  return { active, waiting: queue.length, max: MAX_CONCURRENCY };
}

/**
 * Lets tests change the cap at runtime. Production should set
 * AI_MAX_CONCURRENCY env var instead — this exists for unit tests
 * and one-off operator overrides.
 */
export function setAiMaxConcurrency(n: number): void {
  if (!Number.isFinite(n) || n < 1) return;
  MAX_CONCURRENCY = Math.min(20, Math.floor(n));
  // Drain any queued callers up to the new cap
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  }
}
