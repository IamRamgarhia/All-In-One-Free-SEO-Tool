"use client";

/**
 * Drop-in replacement for native confirm() with proper visuals.
 *
 * Imperative API mirrors the native call site:
 *
 *   const ok = await confirmDialog({
 *     title: "Restart server?",
 *     description: "Page will reload itself once it's back (8-15s).",
 *     confirmLabel: "Restart",
 *     destructive: false,
 *   });
 *   if (!ok) return;
 *
 * Implementation: renders into a single global portal mount that
 * lives in the root layout. Each call promisifies a fresh dialog
 * state. No new dependency — uses framer-motion (already installed)
 * for fade-in / scale-in.
 */

import { createContext, useContext, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

type DialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type DialogRequest = DialogOptions & {
  resolve: (ok: boolean) => void;
};

type Ctx = {
  open: (opts: DialogOptions) => Promise<boolean>;
};

const DialogCtx = createContext<Ctx | null>(null);

let externalOpen: ((opts: DialogOptions) => Promise<boolean>) | null = null;

/**
 * Top-level call you can use anywhere — no hook required.
 *   await confirmDialog({ title: "..." })
 */
export function confirmDialog(opts: DialogOptions): Promise<boolean> {
  if (!externalOpen) {
    // Provider not mounted yet — fall back to native confirm.
    if (typeof window === "undefined") return Promise.resolve(false);
    const ok = window.confirm(
      [opts.title, opts.description].filter(Boolean).join("\n\n"),
    );
    return Promise.resolve(ok);
  }
  return externalOpen(opts);
}

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<DialogRequest | null>(null);

  const open = (opts: DialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ ...opts, resolve });
    });
  };

  // Expose the open function globally so callers don't need a hook
  useEffect(() => {
    externalOpen = open;
    return () => {
      externalOpen = null;
    };
     
  }, []);

  // Close on Esc
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") finish(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function finish(ok: boolean) {
    if (pending) {
      pending.resolve(ok);
      setPending(null);
    }
  }

  return (
    <DialogCtx.Provider value={{ open }}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            key="confirm-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm"
            onClick={() => finish(false)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            >
              <div className="flex items-start gap-3 p-5">
                {pending.destructive && (
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                    <AlertTriangle className="size-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    {pending.title}
                  </h2>
                  {pending.description && (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pending.description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => finish(false)}
                  aria-label="Close"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="flex justify-end gap-2 border-t border-border bg-muted/30 p-3">
                <button
                  type="button"
                  onClick={() => finish(false)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {pending.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => finish(true)}
                  autoFocus
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
                    pending.destructive
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DialogCtx.Provider>
  );
}

/** Hook variant — same API but inside a component tree. */
export function useConfirmDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) {
    throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider");
  }
  return ctx.open;
}
