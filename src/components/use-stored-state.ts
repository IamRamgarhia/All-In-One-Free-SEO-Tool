"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Read a value that only exists in the browser (localStorage, window.*)
 * without the hydrate-in-an-effect double render.
 *
 * The pattern this replaces:
 *
 *     const [collapsed, setCollapsed] = useState(false);
 *     useEffect(() => {
 *       setCollapsed(localStorage.getItem(KEY) === "1");
 *     }, []);
 *
 * That renders the server default first, commits it to the DOM, then
 * runs the effect and renders again — so a user who had the sidebar
 * collapsed watched it flash open and snap shut on every page load.
 * React 19's `set-state-in-effect` rule flags it for that reason.
 *
 * `useSyncExternalStore` takes a server snapshot and a client snapshot,
 * so React knows the two differ and resolves it during hydration rather
 * than after it. No effect, no second commit, no flash.
 *
 * Writes go through `set`, which notifies every hook instance in the
 * page — two components reading the same key stay in sync, which the
 * useState version never did.
 */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // `storage` fires for changes made in OTHER tabs. Same-tab writes are
  // covered by the manual notify in `set` below.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function notify() {
  for (const l of listeners) l();
}

/**
 * useSyncExternalStore requires getSnapshot to return a referentially
 * stable value, or React loops forever. localStorage hands back a fresh
 * string each call and parsed objects are new every time, so cache the
 * parsed result per key and only replace it when the raw string changes.
 */
const cache = new Map<string, { raw: string | null; parsed: unknown }>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Safari private mode, or storage disabled by policy.
    return null;
  }
}

export function useStoredState<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
): [T, (value: T, serialize: (value: T) => string) => void] {
  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const hit = cache.get(key);
    if (hit && hit.raw === raw) return hit.parsed as T;
    let parsed: T;
    try {
      parsed = raw === null ? fallback : parse(raw);
    } catch {
      parsed = fallback;
    }
    cache.set(key, { raw, parsed });
    return parsed;
  }, [key, fallback, parse]);

  // The server has no localStorage, so it always renders the fallback.
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (next: T, serialize: (value: T) => string) => {
      try {
        const raw = serialize(next);
        window.localStorage.setItem(key, raw);
        cache.set(key, { raw, parsed: next });
      } catch {
        // Quota exceeded / storage disabled — keep the in-memory value
        // so the UI still responds, it just won't survive a reload.
        cache.set(key, { raw: cache.get(key)?.raw ?? null, parsed: next });
      }
      notify();
    },
    [key],
  );

  return [value, set];
}
