import { Sparkles, Zap } from "lucide-react";
import { getGscQuickWins } from "@/lib/google-data";

export async function QuickWinsPanel({ siteUrl }: { siteUrl: string }) {
  const rows = await getGscQuickWins({
    siteUrl,
    days: 28,
    limit: 8,
    minImpressions: 50,
  });

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/15 blur-3xl" />
      <header className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Zap className="size-4 text-amber-300" />
            Quick wins
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Keywords ranking just outside page 1 (positions 4–15) with real
            search volume — one tweak away from a big CTR jump.
          </p>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          No quick wins right now. Either every tracked keyword is already on
          page 1 (great problem) or there isn&apos;t enough impression data
          yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {rows.map((r) => (
            <li
              key={r.query}
              className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02]"
            >
              <Sparkles className="size-4 shrink-0 text-amber-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.query}</div>
                <div className="text-xs text-muted-foreground">
                  {r.impressions.toLocaleString()} impressions ·{" "}
                  {r.clicks.toLocaleString()} clicks ·{" "}
                  {(r.ctr * 100).toFixed(1)}% CTR
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-base font-semibold text-amber-300 tabular-nums">
                  #{r.position.toFixed(1)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  current
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
