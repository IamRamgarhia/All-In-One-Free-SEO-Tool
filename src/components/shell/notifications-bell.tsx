"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Activity,
  Inbox,
  Loader2,
} from "lucide-react";
import {
  recentNotifications,
  type Notification,
} from "@/app/notifications/actions";

const LAST_SEEN_KEY = "seo-notifications-last-seen";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSeenMs, setLastSeenMs] = useState<number>(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Guard against concurrent loads triggering setState loops.
  const inFlightRef = useRef(false);

  // Initialise lastSeen from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LAST_SEEN_KEY);
      if (v) {
        const parsed = parseInt(v, 10);
        if (Number.isFinite(parsed)) setLastSeenMs(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Track whether the component is still mounted so async work that
  // finishes after unmount doesn't call setState on a dead component.
  // Server actions can't be aborted mid-flight, but we can ignore the
  // result if we know we no longer need it.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Tracks the in-flight load token so an older response can't overwrite
  // a newer one. Each invocation gets a monotonically increasing id; we
  // only accept the result if it's still the latest.
  const loadIdRef = useRef(0);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    const myId = ++loadIdRef.current;
    try {
      const r = await recentNotifications();
      // Drop stale responses + post-unmount results
      if (!mountedRef.current || myId !== loadIdRef.current) return;
      setItems(r);
    } catch {
      // Leave whatever items we had — never crash the bell.
    } finally {
      if (mountedRef.current && myId === loadIdRef.current) {
        setLoading(false);
      }
      inFlightRef.current = false;
    }
  }, []);

  // Initial load + 60s polling. Effects run AFTER render, never during it.
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Click-outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unread = useMemo(() => {
    if (!items) return 0;
    return items.filter((n) => n.at.getTime() > lastSeenMs).length;
  }, [items, lastSeenMs]);

  const markAllRead = useCallback(() => {
    const now = Date.now();
    setLastSeenMs((prev) => (prev >= now ? prev : now));
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, String(now));
    } catch {
      // ignore
    }
  }, []);

  const handleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // When the panel actually opens, kick off a refresh + schedule mark-read.
  // useEffect is the right place — render-phase side effects break in React 19.
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setTimeout(markAllRead, 1500);
    return () => clearTimeout(t);
  }, [open, load, markAllRead]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_oklch(0.66_0.24_15_/_0.6)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-white/10 bg-card/95 shadow-2xl shadow-violet-500/10 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Notifications</div>
              <div className="text-[11px] text-muted-foreground">
                Recent activity from your data
              </div>
            </div>
            {loading && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null && loading ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                Loading…
              </div>
            ) : items === null || items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                <div className="grid size-10 place-items-center rounded-xl bg-violet-500/10 ring-1 ring-inset ring-violet-500/30">
                  <Inbox className="size-5 text-violet-300" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">All caught up</p>
                  <p className="text-xs text-muted-foreground">
                    Alerts appear here when audits surface critical issues,
                    pages change, ranks drop, or the daily agent finishes
                    a run.
                  </p>
                </div>
                <Link
                  href="/clients/new"
                  onClick={() => setOpen(false)}
                  className="mt-1 inline-flex h-7 items-center gap-1 rounded-md bg-violet-500/15 px-3 text-[11px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
                >
                  Add a client to start tracking →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => setOpen(false)}
                      className={
                        n.at.getTime() > lastSeenMs
                          ? "block px-4 py-3 transition-colors hover:bg-white/[0.04]"
                          : "block px-4 py-3 opacity-70 transition-opacity hover:opacity-100 hover:bg-white/[0.03]"
                      }
                    >
                      <div className="flex items-start gap-2">
                        <LevelIcon level={n.level} />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium">
                              {n.title}
                            </span>
                            {n.at.getTime() > lastSeenMs && (
                              <span className="size-1.5 shrink-0 rounded-full bg-violet-400" />
                            )}
                          </div>
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {n.body}
                          </p>
                          <div className="text-[10px] text-muted-foreground">
                            {n.at.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items && items.length > 0 && (
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-2">
              <span className="text-[10px] text-muted-foreground">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={markAllRead}
                className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Mark all read
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LevelIcon({ level }: { level: Notification["level"] }) {
  const map = {
    success: { icon: CheckCircle2, tone: "text-emerald-300" },
    warning: { icon: AlertTriangle, tone: "text-amber-300" },
    error: { icon: AlertCircle, tone: "text-rose-300" },
    info: { icon: Activity, tone: "text-violet-300" },
  } as const;
  const { icon: Icon, tone } = map[level];
  return <Icon className={`mt-0.5 size-3.5 shrink-0 ${tone}`} />;
}
