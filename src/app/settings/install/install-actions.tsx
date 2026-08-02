"use client";

import { useEffect, useState } from "react";
import {
  AppWindow,
  MonitorDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { safeFetch } from "@/lib/safe-fetch";
import { confirmDialog } from "@/components/ui/confirm-dialog";

// Chrome's beforeinstallprompt event isn't in the TS lib yet.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type ShortcutState = {
  ok: boolean;
  desktopExists: boolean;
  startMenuExists: boolean;
  error?: string;
};

export function InstallActions() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [shortcutState, setShortcutState] = useState<ShortcutState | null>(
    null,
  );
  const [shortcutBusy, setShortcutBusy] = useState(false);
  const [shortcutMsg, setShortcutMsg] = useState<
    null | { ok: true; text: string } | { ok: false; text: string }
  >(null);

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setPwaInstalled(true);
      setInstallPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Detect already-installed PWAs
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS Safari only
      window.navigator.standalone
    ) {
      // Effect is the correct tool here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPwaInstalled(true);
    }

    void refreshShortcut();
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function refreshShortcut() {
    const r = await safeFetch<ShortcutState>("/api/desktop-shortcut");
    setShortcutState(
      r.ok ? r.data : { ok: false, desktopExists: false, startMenuExists: false },
    );
  }

  async function installPwa() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setPwaInstalled(true);
    }
    setInstallPrompt(null);
  }

  async function createShortcut() {
    setShortcutBusy(true);
    setShortcutMsg(null);
    const r = await safeFetch<{ ok: true; message: string }>(
      "/api/desktop-shortcut",
      { method: "POST" },
    );
    setShortcutMsg(
      r.ok
        ? { ok: true, text: r.data.message ?? "Shortcuts created." }
        : { ok: false, text: r.error },
    );
    await refreshShortcut();
    setShortcutBusy(false);
  }

  async function removeShortcut() {
    const ok = await confirmDialog({
      title: "Remove shortcuts?",
      description: "Removes the Desktop and Start Menu entries. The app itself stays installed — you can recreate the shortcuts any time.",
      confirmLabel: "Remove shortcuts",
      destructive: true,
    });
    if (!ok) return;
    setShortcutBusy(true);
    setShortcutMsg(null);
    const r = await safeFetch<{ ok: true; message: string }>(
      "/api/desktop-shortcut",
      { method: "DELETE" },
    );
    setShortcutMsg(
      r.ok
        ? { ok: true, text: r.data.message ?? "Shortcuts removed." }
        : { ok: false, text: r.error },
    );
    await refreshShortcut();
    setShortcutBusy(false);
  }

  const isWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* PWA install */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <AppWindow className="size-4 text-violet-300" />
          <h3 className="text-[14px] font-semibold text-foreground">
            Install as PWA
          </h3>
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Open in its own window. Auto-creates a Start Menu entry. Then
          right-click → Pin to taskbar.
        </p>
        <div className="mt-3">
          {pwaInstalled ? (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="size-3" /> Installed
            </span>
          ) : installPrompt ? (
            <button
              type="button"
              onClick={installPwa}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90"
            >
              <MonitorDown className="size-3.5" /> Install app
            </button>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Open in Chrome / Edge / Brave to see the install button. On
              Safari (Mac/iOS) use Share → Add to Dock / Home Screen.
            </p>
          )}
        </div>
      </div>

      {/* Desktop / Start Menu shortcut */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <MonitorDown className="size-4 text-cyan-300" />
          <h3 className="text-[14px] font-semibold text-foreground">
            Desktop &amp; Start Menu shortcut
          </h3>
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Adds an icon that starts the server <em>and</em> opens the browser —
          works even after you&apos;ve stopped the server.
        </p>
        {!isWindows && (
          <p className="mt-2 text-[11px] text-amber-300">
            Windows-only. On macOS / Linux, install as PWA above.
          </p>
        )}
        {isWindows && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span
                  className={`size-1.5 rounded-full ${
                    shortcutState?.desktopExists ? "bg-emerald-400" : "bg-muted-foreground/40"
                  }`}
                />
                Desktop
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1">
                <span
                  className={`size-1.5 rounded-full ${
                    shortcutState?.startMenuExists ? "bg-emerald-400" : "bg-muted-foreground/40"
                  }`}
                />
                Start Menu
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={createShortcut}
                disabled={shortcutBusy}
                className="inline-flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {shortcutBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <MonitorDown className="size-3.5" />
                )}
                {shortcutState?.desktopExists || shortcutState?.startMenuExists
                  ? "Recreate"
                  : "Create shortcuts"}
              </button>
              {(shortcutState?.desktopExists ||
                shortcutState?.startMenuExists) && (
                <button
                  type="button"
                  onClick={removeShortcut}
                  disabled={shortcutBusy}
                  className="inline-flex h-8 items-center gap-1.5 rounded border border-border bg-card px-3 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" /> Remove
                </button>
              )}
            </div>
            {shortcutMsg && (
              <p
                className={`flex items-start gap-1 text-[11px] ${
                  shortcutMsg.ok ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {shortcutMsg.ok ? (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
                ) : (
                  <AlertCircle className="mt-0.5 size-3 shrink-0" />
                )}
                {shortcutMsg.text}
              </p>
            )}
            {shortcutState?.startMenuExists && (
              <p className="text-[11px] text-muted-foreground">
                Tip: open Start Menu, find “SEO Tool”, right-click → Pin to
                taskbar for one-click access.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tip card spanning both cols */}
      <div className="sm:col-span-2 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-[13px] font-semibold text-foreground">
          Recommended setup
        </h3>
        <ol className="mt-2 space-y-1 pl-5 text-[12px] text-muted-foreground [list-style-type:decimal]">
          <li>
            Create the desktop &amp; Start Menu shortcut (works even when
            server is off).
          </li>
          <li>
            Install as PWA so it opens in its own window with no browser
            chrome.
          </li>
          <li>
            Find “SEO Tool” in your Start Menu, right-click → Pin to taskbar.
          </li>
          <li>
            Use the power button in the bottom-right of the app to restart or
            stop the server.
          </li>
        </ol>
        <a
          href="https://support.microsoft.com/windows/customize-the-taskbar-from-the-taskbar-itself-29b3ebf0-bdfa-2b09-9baa-b0c7e5638a91"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
        >
          How to pin to the taskbar <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
