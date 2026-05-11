"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  XCircle,
  Circle,
} from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";

type Status =
  | {
      ok: true;
      local: string | null;
      remote: string | null;
      updateAvailable: boolean;
      diffUrl: string;
    }
  | { ok: false; error: string }
  | null;

type Step = { name: string; status: "ok" | "skip" | "error"; detail?: string };

type UpdateResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  steps?: Step[];
  restartRecommended?: boolean;
};

export function UpdateCard() {
  const [status, setStatus] = useState<Status>(null);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [response, setResponse] = useState<UpdateResponse | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    const r = await safeFetch<
      Exclude<Status, null> extends infer S
        ? S extends { ok: true }
          ? S
          : never
        : never
    >("/api/update", { cache: "no-store" });
    setStatus(r.ok ? r.data : { ok: false, error: r.error });
    setChecking(false);
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const update = useCallback(async () => {
    setUpdating(true);
    setResponse(null);
    const r = await safeFetch<UpdateResponse>("/api/update", { method: "POST" });
    setResponse(r.ok ? r.data : { ok: false, error: r.error });
    setUpdating(false);
    void check();
  }, [check]);

  return (
    <section
      id="update"
      className="glass-apple relative overflow-hidden scroll-mt-24 rounded-2xl p-5 space-y-3"
    >
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Updates</h3>
          <p className="text-[11px] text-muted-foreground">
            One-click update from GitHub's <code className="font-mono">main</code>
            {" "}branch. Pulls code, installs new dependencies if needed, applies
            migrations. Your data.db and .env.local are preserved.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void check()}
          disabled={checking || updating}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-white/5 px-2 text-xs text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          Re-check
        </button>
      </header>

      {!status && (
        <p className="text-[11px] text-muted-foreground">Checking…</p>
      )}

      {status && !status.ok && (
        <p className="flex items-start gap-1 rounded-md bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300 ring-1 ring-inset ring-rose-500/30">
          <AlertCircle className="size-3 shrink-0 mt-0.5" />
          {status.error}
        </p>
      )}

      {status?.ok && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Installed version
              </p>
              <p className="font-mono">{status.local ?? "unknown"}</p>
            </div>
            <div className="rounded-md bg-white/[0.03] p-2 ring-1 ring-inset ring-white/5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Latest on GitHub
              </p>
              <p className="font-mono">{status.remote ?? "unknown"}</p>
            </div>
          </div>

          {status.updateAvailable ? (
            <div className="rounded-md bg-amber-500/10 p-3 ring-1 ring-inset ring-amber-500/30 space-y-2">
              <p className="text-xs font-medium text-amber-300">
                Update available
              </p>
              <p className="text-[11px] text-muted-foreground">
                A newer commit is on GitHub. Click below to pull it. Most
                changes hot-reload — refresh the page after. If new
                dependencies were added, we'll tell you to restart.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void update()}
                  disabled={updating}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-3 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {updating ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      <Download className="size-3" />
                      Update now
                    </>
                  )}
                </button>
                <a
                  href={status.diffUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                >
                  See changelog on GitHub
                  <ExternalLink className="size-2.5" />
                </a>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-1 rounded-md bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="size-3" />
              You're on the latest version.
            </p>
          )}

          {updating && <UpdateProgress />}

          {response && response.ok && response.steps && (
            <div className="space-y-2 rounded-md bg-emerald-500/5 p-3 ring-1 ring-inset ring-emerald-500/20">
              <p className="text-xs font-medium text-emerald-300">
                {response.message ?? "Update applied"}
              </p>
              <ul className="space-y-1 text-[11px]">
                {response.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {s.status === "ok" ? (
                      <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                    ) : s.status === "skip" ? (
                      <Circle className="size-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <XCircle className="size-3 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0">
                      <span>{s.name}</span>
                      {s.detail && (
                        <span className="ml-1 text-muted-foreground">
                          — {s.detail}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {response.restartRecommended && (
                <p className="rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-300 ring-1 ring-inset ring-amber-500/30">
                  ⚠ Restart the server to finish loading new dependencies.
                  Stop the dev server and re-run the installer command from your
                  Welcome.txt.
                </p>
              )}
            </div>
          )}

          {response && !response.ok && (
            <div className="rounded-md bg-rose-500/10 p-3 text-[11px] text-rose-300 ring-1 ring-inset ring-rose-500/30 space-y-1">
              <p className="font-medium">{response.error ?? "Update failed"}</p>
              {response.steps && (
                <ul className="space-y-0.5">
                  {response.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {s.status === "ok" ? (
                        <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
                      ) : s.status === "skip" ? (
                        <Circle className="size-3 shrink-0 text-muted-foreground" />
                      ) : (
                        <XCircle className="size-3 shrink-0 text-rose-400" />
                      )}
                      <span>
                        {s.name}
                        {s.detail && (
                          <span className="ml-1 text-muted-foreground">
                            — {s.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Animated progress bar shown while /api/update is in flight. The
 * endpoint runs synchronously (no streaming), so we display an
 * "approximate" progress that:
 *   - Grows quickly to 30% in the first 5s   (git fetch + pull)
 *   - Reaches 70% by 15s                     (pnpm install, often skipped)
 *   - Caps at 95% from 30s onwards           (still working, just slower)
 *   - The parent component sets `updating=false` once the response
 *     arrives — when this component unmounts it lands at 100% visually.
 *
 * Also shows elapsed time and which phase we're estimated to be in,
 * so the user knows it's still working — not frozen.
 */
function UpdateProgress() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const t = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);
    return () => clearInterval(t);
  }, []);

  // Easing curve: fast at first, slow at the end. Caps at 95.
  const seconds = elapsedMs / 1000;
  const percent =
    seconds < 5
      ? (seconds / 5) * 30
      : seconds < 15
        ? 30 + ((seconds - 5) / 10) * 40
        : seconds < 30
          ? 70 + ((seconds - 15) / 15) * 25
          : 95;

  // Pick the phase label by elapsed time
  const phase =
    seconds < 5
      ? "Fetching latest commits from GitHub…"
      : seconds < 15
        ? "Installing dependencies (if any changed)…"
        : seconds < 30
          ? "Applying database migrations…"
          : "Wrapping up — almost done…";

  const allPhases = [
    { label: "Fetch from GitHub", threshold: 5 },
    { label: "Install new dependencies", threshold: 15 },
    { label: "Apply database migrations", threshold: 25 },
    { label: "Finalize", threshold: 30 },
  ];

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
      {/* Top: label + elapsed */}
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Loader2 className="size-3.5 animate-spin text-violet-400" />
          {phase}
        </p>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.floor(seconds)}s elapsed
        </span>
      </div>

      {/* Growing progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Per-phase status list */}
      <ul className="space-y-1 text-[11px]">
        {allPhases.map(({ label, threshold }) => {
          const done = seconds >= threshold;
          const active = !done && seconds >= threshold - 5;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 ${
                done
                  ? "text-foreground"
                  : active
                    ? "text-foreground"
                    : "text-muted-foreground/60"
              }`}
            >
              {done ? (
                <CheckCircle2 className="size-3 shrink-0 text-emerald-400" />
              ) : active ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-violet-400" />
              ) : (
                <Circle className="size-3 shrink-0" />
              )}
              {label}
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-muted-foreground">
        Usually 15–30 seconds. Up to a minute if new dependencies were added.
        Page will refresh on its own when done.
      </p>
    </div>
  );
}
