"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Clock, Loader2, Minus, Plus } from "lucide-react";
import { logTaskTime } from "./actions";

export function TimeTracker({
  taskId,
  initialMinutes,
}: {
  taskId: number;
  initialMinutes: number | null;
}) {
  const t = useTranslations("tasks.time");
  const [minutes, setMinutes] = useState(initialMinutes ?? 0);
  const [pending, startTransition] = useTransition();

  function add(delta: number) {
    startTransition(async () => {
      const r = await logTaskTime({ taskId, minutes: delta });
      if (r.ok) setMinutes(r.total);
    });
  }

  const hours = Math.floor(minutes / 60);
  const remM = minutes % 60;
  const display =
    hours > 0
      ? `${hours}h${remM > 0 ? ` ${remM}m` : ""}`
      : `${minutes}m`;

  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-white/5 p-0.5 ring-1 ring-inset ring-white/10">
      <button
        type="button"
        onClick={() => add(-15)}
        disabled={pending || minutes < 15}
        title={t("subtract15")}
        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-30"
      >
        <Minus className="size-2.5" />
      </button>
      <span className="inline-flex items-center gap-1 px-1 text-[11px] tabular-nums text-foreground">
        {pending ? (
          <Loader2 className="size-2.5 animate-spin" />
        ) : (
          <Clock className="size-2.5 text-muted-foreground" />
        )}
        {minutes > 0 ? display : "—"}
      </span>
      <button
        type="button"
        onClick={() => add(15)}
        disabled={pending}
        title={t("add15")}
        className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-white/5 hover:text-foreground"
      >
        <Plus className="size-2.5" />
      </button>
    </div>
  );
}
