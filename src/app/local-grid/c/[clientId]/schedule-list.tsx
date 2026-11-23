"use client";

import { CalendarClock, Pause, Play, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import {
  deleteGridSchedule,
  toggleGridSchedule,
} from "../../actions";

type Schedule = {
  id: number;
  query: string;
  cadence: string;
  enabled: boolean;
  lastRanAt: Date | null;
  centerLat: number;
  centerLng: number;
  gridSize: number;
  spacingM: number;
};

export function ScheduleList({ schedules }: { schedules: Schedule[] }) {
  const t = useTranslations("localTab.localGrid.scheduleList");
  const locale = useLocale();
  if (schedules.length === 0) {
    return null;
  }

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <CalendarClock className="size-4 text-violet-300" />
          {t("title", { count: schedules.length })}
        </h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {t("description")}
        </p>
      </header>
      <ul className="divide-y divide-white/[0.05]">
        {schedules.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span
              className={`size-2 shrink-0 rounded-full ${s.enabled ? "bg-emerald-400" : "bg-muted-foreground/40"}`}
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.query}</div>
              <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                <span>{t.has(`cadence.${s.cadence}`) ? t(`cadence.${s.cadence}`) : s.cadence}</span>
                <span>· {s.gridSize}×{s.gridSize}</span>
                <span>· {s.spacingM}m</span>
                <span>· ({(s.centerLat / 1_000_000).toFixed(4)}, {(s.centerLng / 1_000_000).toFixed(4)})</span>
                {s.lastRanAt && (
                  <span>· {t("lastRan", { date: new Date(s.lastRanAt).toLocaleDateString(locale) })}</span>
                )}
              </div>
            </div>
            <form action={toggleGridSchedule.bind(null, s.id)}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10 hover:text-foreground"
              >
                {s.enabled ? (
                  <>
                    <Pause className="size-3" />
                    {t("pause")}
                  </>
                ) : (
                  <>
                    <Play className="size-3" />
                    {t("resume")}
                  </>
                )}
              </button>
            </form>
            <form action={deleteGridSchedule.bind(null, s.id)}>
              <button
                type="submit"
                aria-label={t("delete")}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
              >
                <X className="size-3.5" />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
