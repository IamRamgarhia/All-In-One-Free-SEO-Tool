"use client";

import { useState, useTransition } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { trackResource } from "./actions";

export function TrackResourceButton({
  resourceId,
  clients,
  alreadyTrackedClientIds,
}: {
  resourceId: number;
  clients: { id: number; name: string }[];
  alreadyTrackedClientIds: number[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (clients.length === 0) {
    return (
      <span className="text-[10px] text-muted-foreground">
        Add a client first
      </span>
    );
  }

  const allTracked = clients.every((c) =>
    alreadyTrackedClientIds.includes(c.id),
  );

  if (allTracked) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
        <Check className="size-3" />
        All tracked
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="inline-flex h-6 items-center gap-1 rounded-md bg-violet-500/15 px-2 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Plus className="size-3" />
        )}
        Track
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-lg border border-white/10 bg-card/95 shadow-xl backdrop-blur-md">
          {clients.map((c) => {
            const tracked = alreadyTrackedClientIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                disabled={tracked || pending}
                onClick={() =>
                  startTransition(async () => {
                    await trackResource(resourceId, c.id);
                    setOpen(false);
                  })
                }
                className={
                  tracked
                    ? "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-emerald-300 opacity-50"
                    : "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5"
                }
              >
                {tracked ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Plus className="size-3" />
                )}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
