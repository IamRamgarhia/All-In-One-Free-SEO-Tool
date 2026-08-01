/**
 * In-process scheduler for the background runners.
 *
 * Before this, all six runners hung off a single line in the dashboard
 * page component:
 *
 *     try { tickDailyAgent().catch(() => {}); } catch {}
 *
 * which meant nothing ran unless a human loaded `/`. Go on holiday and
 * rank checks, page monitoring, alerting, scheduled reports and the
 * weekly digest all silently stopped — while the queue UI kept telling
 * users "publishes on the next daily-agent tick (≤24h)". For a product
 * sold to agencies on automation, the automation was a side effect of
 * someone opening a browser tab.
 *
 * This is a long-lived Node server (`next start` / the Docker CMD), so
 * a plain interval is the right tool — no external cron, no extra
 * service, still works on the $5 VPS the project targets. The dashboard
 * still nudges the scheduler on load, which covers the case where the
 * process was asleep or just restarted.
 *
 * Two properties the old approach lacked:
 *
 *   1. **Crash-safe claiming.** tickDailyAgent wrote its `last_run`
 *      BEFORE doing the work, so a process that died mid-run skipped
 *      the entire batch for 24h with no record. Runners here record
 *      started/finished separately, so an interrupted run is visible
 *      and retried rather than silently swallowed.
 *   2. **Per-runner isolation.** One runner throwing can't stop the
 *      others, and each records its own last-success timestamp.
 */

import { getSetting, setSetting } from "./settings-store";

type Runner = {
  id: string;
  label: string;
  /** How often to attempt this runner. */
  everyMs: number;
  run: () => Promise<unknown>;
};

/**
 * How often the scheduler wakes up. Individual runners decide whether
 * they're actually due; this is just the granularity.
 */
const TICK_MS = 60_000;

/**
 * A run that started but never recorded a finish is considered dead
 * after this long, and may be retried. Long enough for the heaviest
 * legitimate run (a Monday rank sweep across hundreds of keywords),
 * short enough that a crash doesn't cost a whole day.
 */
const STALE_RUN_MS = 30 * 60_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function runners(): Runner[] {
  return [
    {
      id: "daily_agent",
      label: "Daily agent",
      everyMs: 24 * HOUR,
      run: async () => (await import("./daily-agent")).tickDailyAgent(),
    },
    {
      id: "schedule_runner",
      label: "Scheduled reports",
      everyMs: 15 * MINUTE,
      run: async () => (await import("./report-mailer")).tickScheduleRunner(),
    },
    {
      id: "page_monitor",
      label: "Page monitor",
      everyMs: 60 * MINUTE,
      run: async () => (await import("./report-mailer")).tickPageMonitorRunner(),
    },
    {
      id: "weekly_digest",
      label: "Weekly digest",
      everyMs: 6 * HOUR,
      run: async () => (await import("./weekly-digest")).tickWeeklyDigestRunner(),
    },
    {
      id: "auto_backup",
      label: "Automatic backup",
      everyMs: 12 * HOUR,
      run: async () => (await import("./auto-backup")).tickAutoBackup(),
    },
    {
      id: "retention_cleanup",
      label: "Data retention cleanup",
      everyMs: 24 * HOUR,
      run: async () => (await import("./retention-cleanup")).tickRetentionCleanup(),
    },
  ];
}

const startedKey = (id: string) => `scheduler.${id}.started_at` as const;
const finishedKey = (id: string) => `scheduler.${id}.finished_at` as const;
const errorKey = (id: string) => `scheduler.${id}.last_error` as const;

/** Process-local guard so one runner can't overlap itself. */
const inFlight = new Set<string>();

async function runOne(r: Runner, now: number): Promise<void> {
  if (inFlight.has(r.id)) return;

  const [startedAt, finishedAt] = await Promise.all([
    getSetting<number>(startedKey(r.id)).catch(() => null),
    getSetting<number>(finishedKey(r.id)).catch(() => null),
  ]);

  // Another process (or an earlier tick) is mid-run and hasn't gone
  // stale yet — leave it alone.
  const running =
    typeof startedAt === "number" &&
    (typeof finishedAt !== "number" || finishedAt < startedAt);
  if (running && now - startedAt < STALE_RUN_MS) return;

  // Not due yet. Measured from the last SUCCESSFUL finish, so a run
  // that crashed retries on the next tick instead of being treated as
  // done for a full period — the bug that made a mid-run crash cost a
  // whole day of automation.
  if (typeof finishedAt === "number" && now - finishedAt < r.everyMs) return;

  inFlight.add(r.id);
  await setSetting(startedKey(r.id), now).catch(() => undefined);
  try {
    await r.run();
    await setSetting(finishedKey(r.id), Date.now()).catch(() => undefined);
    await setSetting(errorKey(r.id), null).catch(() => undefined);
  } catch (err) {
    // Record and move on. One failing runner must not stop the others,
    // and the error needs to be visible in Settings rather than only in
    // a log the user will never open.
    console.error(`[scheduler] ${r.id} failed:`, (err as Error).message);
    await setSetting(errorKey(r.id), (err as Error).message).catch(
      () => undefined,
    );
    // Leave finished_at alone so the next tick retries.
  } finally {
    inFlight.delete(r.id);
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Run every due runner once. Safe to call from anywhere — the dashboard
 * calls it on load so a just-restarted process catches up immediately
 * instead of waiting a full tick.
 */
export async function tickScheduler(): Promise<void> {
  const now = Date.now();
  // Sequential: these all hit the same SQLite file and several launch
  // browsers. Running six at once on a 1-vCPU VPS is how you get an
  // audit that times out because the digest is holding the write lock.
  for (const r of runners()) {
    await runOne(r, now).catch(() => undefined);
  }
}

/**
 * Start the interval. Idempotent — repeated calls are no-ops, which
 * matters because Next re-imports modules on hot reload.
 *
 * `unref()` keeps the timer from holding the process open on its own,
 * so `docker stop` and Ctrl-C still exit promptly.
 */
export function startScheduler(): void {
  if (timer) return;
  if (process.env.SEO_DISABLE_SCHEDULER === "1") return;

  timer = setInterval(() => {
    void tickScheduler().catch(() => undefined);
  }, TICK_MS);
  timer.unref?.();

  // Kick once on boot, after a short delay so it doesn't compete with
  // the server's own startup work.
  const kickoff = setTimeout(() => {
    void tickScheduler().catch(() => undefined);
  }, 10_000);
  kickoff.unref?.();
}

export type SchedulerStatus = {
  id: string;
  label: string;
  everyMs: number;
  lastFinishedAt: number | null;
  lastStartedAt: number | null;
  lastError: string | null;
  running: boolean;
  dueInMs: number | null;
};

/** Read the state of every runner, for the Settings → Automations view. */
export async function schedulerStatus(): Promise<SchedulerStatus[]> {
  const now = Date.now();
  return Promise.all(
    runners().map(async (r) => {
      const [startedAt, finishedAt, lastError] = await Promise.all([
        getSetting<number>(startedKey(r.id)).catch(() => null),
        getSetting<number>(finishedKey(r.id)).catch(() => null),
        getSetting<string>(errorKey(r.id)).catch(() => null),
      ]);
      const running =
        typeof startedAt === "number" &&
        (typeof finishedAt !== "number" || finishedAt < startedAt) &&
        now - startedAt < STALE_RUN_MS;
      return {
        id: r.id,
        label: r.label,
        everyMs: r.everyMs,
        lastFinishedAt: typeof finishedAt === "number" ? finishedAt : null,
        lastStartedAt: typeof startedAt === "number" ? startedAt : null,
        lastError: typeof lastError === "string" ? lastError : null,
        running,
        dueInMs:
          typeof finishedAt === "number"
            ? Math.max(0, r.everyMs - (now - finishedAt))
            : 0,
      };
    }),
  );
}
