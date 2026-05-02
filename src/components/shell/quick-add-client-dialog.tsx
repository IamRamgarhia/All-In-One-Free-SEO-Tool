"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Globe,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickAddClient } from "@/app/clients/actions";

/**
 * Global quick-add dialog. Use the `useQuickAddClient` hook from any client
 * component to trigger it. The provider is mounted in the root layout.
 */

type Ctx = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const QuickAddCtx = createContext<Ctx | null>(null);

export function QuickAddClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const ctx: Ctx = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen,
  };

  return (
    <QuickAddCtx.Provider value={ctx}>
      {children}
      <QuickAddClientDialog open={isOpen} onClose={() => setOpen(false)} />
    </QuickAddCtx.Provider>
  );
}

export function useQuickAddClient(): Ctx {
  const ctx = useContext(QuickAddCtx);
  if (!ctx) {
    // Allow safe fallback in environments where provider isn't mounted (e.g. tests)
    return { open: () => {}, close: () => {}, isOpen: false };
  }
  return ctx;
}

function QuickAddClientDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await quickAddClient(url);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Reset form, close dialog, jump to the new client's detail page
      setUrl("");
      onClose();
      router.push(`/clients/${r.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      size="sm"
      title="Add a new client"
      description="Just paste the website URL — we'll auto-fetch the logo, name, address, social links, tech stack, and niche, then seed an initial task list."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="qa-url">Website URL</Label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="qa-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="acmecoffee.com"
              className="pl-9"
              autoFocus
              required
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            We&apos;ll add https:// for you.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
          <Sparkles className="mr-1 inline size-3 text-violet-300" />
          Auto-extracted: logo, name, description, address, phone, social
          links, tech stack, niche, initial niche-aware + stack-aware task
          list. Editable later.
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !url.trim()}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Setting up… (~10s)
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                Create client
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Standalone trigger button that opens the modal. Drop anywhere — no styling
 * coupling to the parent.
 */
export function QuickAddClientButton({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const ctx = useQuickAddClient();
  return (
    <button type="button" onClick={ctx.open} className={className}>
      {children ?? "Add client"}
    </button>
  );
}
