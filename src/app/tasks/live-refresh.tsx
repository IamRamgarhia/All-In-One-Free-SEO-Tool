"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the task list current without a manual reload.
 *
 * Tasks change from outside the page: Claude marks one done through the
 * MCP server, from the chat panel or from a terminal. The page is rendered
 * on the server, so it only learns of that by asking again. router.refresh()
 * re-renders the server part and keeps what the person has selected.
 * It pauses while the tab is hidden and catches up the moment it is shown.
 */
export function LiveRefresh({ everyMs = 4000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);
  return null;
}
