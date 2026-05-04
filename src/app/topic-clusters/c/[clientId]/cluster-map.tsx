type ClusterNode = {
  topic: string;
  keywords: { id: number; query: string; position: number | null }[];
};

/**
 * SVG force-free radial layout — clusters on a ring around the center, each
 * cluster's keywords on a smaller ring around its topic node. No physics
 * engine, no library. Renders cleanly for up to ~12 clusters / ~80 keywords.
 */
export function ClusterMap({ clusters }: { clusters: ClusterNode[] }) {
  if (clusters.length === 0) return null;

  const W = 800;
  const H = 600;
  const centerX = W / 2;
  const centerY = H / 2;
  const clusterRing = Math.min(W, H) * 0.32;

  // Clamp how tightly we pack keywords around each topic so labels don't
  // collide on dense clusters
  const kwRadius = (count: number) => {
    if (count <= 4) return 50;
    if (count <= 8) return 75;
    if (count <= 14) return 100;
    return 120;
  };

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-base font-semibold">Cluster map</h2>
        <p className="text-[11px] text-muted-foreground">
          Each ring is a topic cluster. Inner colored nodes are keywords —
          green = ranking top 3, amber = top 10, cyan = top 20, rose = beyond.
        </p>
      </header>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          style={{ minWidth: 600 }}
        >
          <defs>
            <radialGradient id="cluster-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.65 0.22 285 / 0.15)" />
              <stop offset="100%" stopColor="oklch(0.65 0.22 285 / 0)" />
            </radialGradient>
          </defs>

          {/* Center origin */}
          <circle cx={centerX} cy={centerY} r={6} fill="oklch(0.7 0.22 275)" />
          <text
            x={centerX}
            y={centerY + 28}
            textAnchor="middle"
            fontSize="11"
            fill="oklch(0.7 0.05 275)"
          >
            site
          </text>

          {clusters.map((c, i) => {
            const angle = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;
            const cx = centerX + Math.cos(angle) * clusterRing;
            const cy = centerY + Math.sin(angle) * clusterRing;
            const r = kwRadius(c.keywords.length);
            const pillar = c.keywords[0];
            return (
              <g key={c.topic}>
                {/* Connector to center */}
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={cx}
                  y2={cy}
                  stroke="oklch(1 0 0 / 0.08)"
                  strokeWidth={1}
                />

                {/* Cluster halo */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 30}
                  fill="url(#cluster-bg)"
                  opacity={0.6}
                />

                {/* Topic node */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={14}
                  fill="oklch(0.65 0.22 285 / 0.4)"
                  stroke="oklch(0.7 0.22 285)"
                  strokeWidth={1.5}
                />
                <text
                  x={cx}
                  y={cy - 22}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="oklch(0.85 0.1 285)"
                >
                  {c.topic}
                </text>

                {/* Keyword nodes — radial layout around the topic */}
                {c.keywords.map((kw, j) => {
                  const a =
                    (j / c.keywords.length) * Math.PI * 2 - Math.PI / 2;
                  const kx = cx + Math.cos(a) * r;
                  const ky = cy + Math.sin(a) * r;
                  const tone = positionTone(kw.position);
                  return (
                    <g key={kw.id}>
                      <line
                        x1={cx}
                        y1={cy}
                        x2={kx}
                        y2={ky}
                        stroke="oklch(1 0 0 / 0.06)"
                        strokeWidth={1}
                      />
                      <circle
                        cx={kx}
                        cy={ky}
                        r={5}
                        fill={tone.fill}
                        stroke={tone.stroke}
                        strokeWidth={1}
                      />
                      {kw === pillar && (
                        <text
                          x={kx}
                          y={ky - 10}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="500"
                          fill="oklch(0.85 0.1 145)"
                        >
                          {kw.query.length > 22
                            ? kw.query.slice(0, 22) + "…"
                            : kw.query}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function positionTone(p: number | null): { fill: string; stroke: string } {
  if (p === null)
    return {
      fill: "oklch(1 0 0 / 0.1)",
      stroke: "oklch(1 0 0 / 0.25)",
    };
  if (p <= 3)
    return {
      fill: "oklch(0.74 0.18 145 / 0.6)",
      stroke: "oklch(0.74 0.18 145)",
    };
  if (p <= 10)
    return {
      fill: "oklch(0.78 0.16 75 / 0.6)",
      stroke: "oklch(0.78 0.16 75)",
    };
  if (p <= 20)
    return {
      fill: "oklch(0.74 0.18 200 / 0.6)",
      stroke: "oklch(0.74 0.18 200)",
    };
  return {
    fill: "oklch(0.7 0.22 25 / 0.5)",
    stroke: "oklch(0.7 0.22 25)",
  };
}
