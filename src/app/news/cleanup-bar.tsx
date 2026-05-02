"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cleanupOldItems,
  clearAllItems,
  deleteOneItem,
} from "./actions";

export function CleanupBar() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function clean(days: number) {
    setMsg(null);
    startTransition(async () => {
      const r = await cleanupOldItems({ days });
      setMsg(`Deleted ${r.deleted} item${r.deleted === 1 ? "" : "s"} older than ${days} days.`);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  function clearAll() {
    if (!confirm("Delete every saved news item? Feed configurations stay.")) return;
    setMsg(null);
    startTransition(async () => {
      const r = await clearAllItems();
      setMsg(`Cleared ${r.deleted} items.`);
      setTimeout(() => setMsg(null), 4000);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Clean up older than:</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => clean(7)}
        disabled={pending}
      >
        <Trash2 className="size-3" />
        7d
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => clean(30)}
        disabled={pending}
      >
        <Trash2 className="size-3" />
        30d
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => clean(90)}
        disabled={pending}
      >
        <Trash2 className="size-3" />
        90d
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={clearAll}
        disabled={pending}
        className="text-rose-300/70 hover:text-rose-300"
      >
        Clear all
      </Button>
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {msg && (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <CheckCircle2 className="size-3" />
          {msg}
        </span>
      )}
    </div>
  );
}

export function DeleteItemButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          await deleteOneItem(id);
          setHidden(true);
        })
      }
      disabled={pending}
      title="Delete this item"
      className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
    >
      <X className="size-3" />
    </button>
  );
}
