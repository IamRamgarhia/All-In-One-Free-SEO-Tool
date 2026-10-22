/**
 * Static preview of the workspace UI — no fake screenshot PNG, built from
 * the same visual language as the logged-in app (navy shell, score gauge).
 */
export function LandingHeroConsole({ caption }: { caption: string }) {
  const bars = [42, 58, 52, 71, 68, 82, 79, 85, 88, 84];

  return (
    <div className="relative mx-auto w-full max-w-[540px] lg:max-w-none">
      <div
        className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[#5b8fd4]/20 blur-3xl lg:-inset-10"
        aria-hidden
      />
      <figure
        className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0c111a] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.06] lg:rotate-[1.25deg]"
        aria-label={caption}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.08] bg-[#111721] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="ms-2 font-mono text-[10px] text-white/35">
            global_rank · portfolio
          </span>
        </div>

        <div className="flex min-h-[280px] sm:min-h-[320px]">
          <div
            className="hidden w-[52px] shrink-0 flex-col gap-3 border-e border-white/[0.06] bg-[#1a2744] py-4 sm:flex"
            aria-hidden
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`mx-auto h-7 w-7 rounded-lg ${i === 0 ? "bg-[#5b8fd4]/35 ring-1 ring-[#5b8fd4]/50" : "bg-white/[0.06]"}`}
              />
            ))}
          </div>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#7eb8f0]/80">
                  Tableau de bord
                </p>
                <p className="mt-1 text-sm font-semibold text-white">3 clients actifs</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5">
                <span className="relative flex size-8 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="size-8 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="3"
                      strokeDasharray="88 88"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold text-emerald-300">
                    82
                  </span>
                </span>
                <span className="text-[11px] text-white/70">Score moyen</span>
              </div>
            </div>

            <div className="mt-5 flex h-[88px] items-end gap-1 rounded-xl border border-white/[0.06] bg-[#111721]/80 px-3 pb-2 pt-3">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="min-w-0 flex-1 rounded-sm bg-gradient-to-t from-[#5b8fd4]/15 to-[#5b8fd4]/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            <ul className="mt-4 space-y-2">
              {[
                { name: "client-alpha.fr", score: 86, delta: "+4" },
                { name: "boutique-exemple.com", score: 79, delta: "+2" },
                { name: "saas-demo.io", score: 71, delta: "−1" },
              ].map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <span className="truncate font-mono text-[11px] text-white/75">
                    {row.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                    <span className="text-white/90">{row.score}</span>
                    <span
                      className={
                        row.delta.startsWith("+")
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }
                    >
                      {row.delta}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </figure>
      <figcaption className="mt-4 text-center text-[11px] text-white/40 lg:text-start">
        {caption}
      </figcaption>
    </div>
  );
}
