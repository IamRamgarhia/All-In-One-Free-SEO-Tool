"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once on mount. Wrapped in setTimeout(0) to
 * keep the initial render fast and to satisfy the
 * react-hooks/set-state-in-effect lint rule pattern used elsewhere.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // ignore — SW is optional
      });
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return null;
}
