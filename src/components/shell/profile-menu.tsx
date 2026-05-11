"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Settings,
  HelpCircle,
  RefreshCw,
  Info,
  LogOut,
  ExternalLink,
} from "lucide-react";

/**
 * Profile dropdown — replaces the previous static "P" avatar that did
 * nothing on click. Hosts Settings, About, Update, Help, and (if APP_PASSWORD
 * is set) Sign out.
 */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Check on mount whether APP_PASSWORD is set on the server — if not,
  // there's no point showing a Sign-out button.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setAuthEnabled(Boolean(j?.enabled));
      })
      .catch(() => {
        if (!cancelled) setAuthEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile menu"
        className="relative size-8 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 grid place-items-center text-xs font-semibold text-white shadow-lg shadow-violet-500/40 ring-1 ring-inset ring-white/30 transition-transform hover:scale-105"
      >
        <span className="relative">P</span>
        <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/30 to-transparent opacity-50" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-60 overflow-hidden rounded-xl border border-white/10 bg-card/95 shadow-2xl shadow-violet-500/10 backdrop-blur-xl">
          <div className="border-b border-white/[0.06] px-4 py-3">
            <p className="text-xs font-semibold">SEO Tool</p>
            <p className="text-[10px] text-muted-foreground">
              Local · single-user
            </p>
          </div>
          <div className="flex flex-col py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <Settings className="size-3.5 text-muted-foreground" />
              Settings
            </Link>
            <Link
              href="/settings#ai"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <Settings className="size-3.5 text-muted-foreground" />
              AI provider keys
            </Link>
            <Link
              href="/settings#update"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <RefreshCw className="size-3.5 text-muted-foreground" />
              Check for updates
            </Link>
            <Link
              href="/seo-chat/capabilities"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <HelpCircle className="size-3.5 text-muted-foreground" />
              What the AI chat can do
            </Link>
            <Link
              href="/automations/overview"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <Info className="size-3.5 text-muted-foreground" />
              What's automated
            </Link>
            <a
              href="https://github.com/IamRamgarhia/seo"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5"
            >
              <ExternalLink className="size-3.5 text-muted-foreground" />
              GitHub repo
            </a>
            {authEnabled && (
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
              >
                <LogOut className="size-3.5" />
                Sign out (clears password cookie)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
