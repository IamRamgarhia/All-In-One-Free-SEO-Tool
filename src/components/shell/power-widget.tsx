"use client";

/**
 * Sticky bottom-right power button. Surfaces three actions:
 *   - Restart server (when the app feels stuck)
 *   - Stop server (clean shutdown — relaunch via desktop shortcut)
 *   - Open install / shortcut settings
 *
 * Designed to always be one click away. Sits to the LEFT of the AI
 * assistant bubble so the two don't overlap.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Power, RefreshCw, Square, Settings as Cog, X } from "lucide-react";

export function PowerWidget() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "restart" | "stop">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Esc
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!open) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function restart() {
    if (!confirm("Restart the server now? The page will reload itself once it's back (8–15 seconds).")) {
      return;
    }
    setBusy("restart");
    setMsg("Restarting…");
    try {
      const res = await fetch("/api/restart", { method: "POST" });
      const j = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (!j.ok) {
        toast.error("Restart failed", { description: j.error ?? "Unknown error" });
        setMsg(j.error ?? "Restart failed.");
        setBusy(null);
        return;
      }
      toast.success("Restarting server", {
        description: "Page will reload itself once the server is back",
      });
      // Poll for the server to come back, then hard-reload.
      setMsg("Waiting for server to come back…");
      const start = Date.now();
      const poll = async () => {
        try {
          const r = await fetch("/api/health-ping", { cache: "no-store" });
          if (r.ok) {
            location.reload();
            return;
          }
        } catch {
          // expected during downtime
        }
        if (Date.now() - start < 60_000) {
          setTimeout(poll, 1_500);
        } else {
          setMsg("Server didn't come back. Try the desktop shortcut.");
          setBusy(null);
        }
      };
      setTimeout(poll, 4_000);
    } catch (err) {
      setMsg((err as Error).message || "Restart failed.");
      setBusy(null);
    }
  }

  async function stop() {
    if (
      !confirm(
        "Stop the server? The app will go offline. Use your desktop shortcut or run seo.cmd to start it again.",
      )
    ) {
      return;
    }
    setBusy("stop");
    setMsg("Stopping…");
    try {
      await fetch("/api/shutdown", { method: "POST" });
      setMsg("Server stopped. Launch it again from your desktop shortcut.");
    } catch {
      setMsg("Server stopped.");
    }
  }

  return (
    <div ref={ref} className="fixed bottom-5 right-20 z-40">
      {open && (
        <div className="mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[12px] font-medium text-foreground">
              Server controls
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              onClick={restart}
              disabled={busy !== null}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 text-violet-300 ${busy === "restart" ? "animate-spin" : ""}`}
              />
              <span className="flex-1">Restart server</span>
              <span className="text-[10px] text-muted-foreground">~10s</span>
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={busy !== null}
              className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              <Square className="size-3.5 text-rose-300" />
              <span className="flex-1">Stop server</span>
            </button>
            <Link
              href="/settings/install"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded px-2 py-2 text-[13px] text-foreground transition-colors hover:bg-accent"
            >
              <Cog className="size-3.5 text-muted-foreground" />
              <span className="flex-1">Install as app / shortcuts</span>
            </Link>
          </div>
          {msg && (
            <div className="border-t border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
              {msg}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Server controls"
        aria-label="Server controls"
        className="grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
      >
        <Power className="size-4" />
      </button>
    </div>
  );
}
