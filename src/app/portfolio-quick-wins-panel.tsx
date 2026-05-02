import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { getPortfolioQuickWins } from "@/lib/dashboard-data";

export async function PortfolioQuickWinsPanel() {
  const wins = await getPortfolioQuickWins({ limit: 8 });
  if (wins.length === 0) return null;

  return (
    <section className="glass-apple animate-page-enter relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-amber-500/15 blur-3xl" />
      <header className="relative flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Zap className="size-4 text-amber-300" />
            Quick wins across all clients
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Highest-impression keywords sitting at positions 4-15. One tweak
            from page 1.
          </p>
        </div>
      </header>
      <ul className="relative divide-y divide-white/[0.04]">
        {wins.map((w, i) => (
          <li
            key={`${w.clientId}-${w.query}-${i}`}
            className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02]"
          >
            <Sparkles className="size-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{w.query}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link
                  href={`/clients/${w.clientId}`}
                  className="hover:text-foreground hover:underline"
                >
                  {w.clientName}
                </Link>
                <span>·</span>
                <span>
                  {w.impressions.toLocaleString()} impr · {w.clicks.toLocaleString()}{" "}
                  clicks
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-base font-semibold text-amber-300 tabular-nums">
                #{w.position.toFixed(1)}
              </div>
              <div className="text-[11px] text-muted-foreground">current</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
