import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server build under .next/standalone — the
  // packaging script copies it into dist/ alongside a bundled Node binary
  // so end-users can run the app by double-clicking, no Node install required.
  output: "standalone",

  /**
   * Trace from THIS folder, and copy nothing private out of it.
   *
   * Two separate problems, both measured on 19 Nov 2026 by listing what
   * the build actually produced:
   *
   * 1. Next inferred the workspace root as the PARENT directory, because
   *    a stray package-lock.json sits there ("We detected multiple
   *    lockfiles and selected …\Downloads\Claude"). Tracing from a
   *    parent means unrelated sibling projects are inside the tracing
   *    root. Pinning it is the only way that stays correct.
   *
   * 2. Even rooted here, `.next/standalone` came out holding `.git`
   *    (10 MB), `dist`, `e2e`, `src` — and `backups/`, which is SEVEN
   *    copies of the live SQLite database. `backups/` is gitignored, so
   *    releases and CI images built from a clean checkout were never
   *    affected; a local `docker compose up --build`, or the prebuilt
   *    installer payload, would have shipped the maintainer's client
   *    data to every person who downloaded the app.
   *
   * Excludes rather than an allowlist because this is a safety net: the
   * packaging script copies by allowlist, and these two have to disagree
   * before anything private can leave the folder.
   */
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    /**
     * ROOT-ANCHORED ONLY. Never `**` + a directory name.
     *
     * A `**\/dist\/**` pattern was tried here and it matched
     * `node_modules/next/dist/**` — excluding Next's own source from the
     * build. The standalone output then carried 113 of the next
     * package's 3,488 files and died on startup with
     * "Cannot find module '../build/output/log'", a file its own server
     * entry requires on line 27. Both the payload and the Docker image
     * are built from that directory, so the broad pattern turned a
     * privacy fix into a product that does not boot.
     *
     * Caught by running the output rather than by reading it, which is
     * the only way this class of thing gets caught.
     *
     * These stay as a first line. scripts/prune-standalone.mjs, which
     * deletes by exact name after the build, is the mechanism actually
     * relied on.
     */
    "*": [
      "./.git/**",
      "./backups/**",
      "./.e2e/**",
      "./test-results/**",
      "./playwright-report/**",
    ],
  },

  // Native modules and ones that load files from disk at runtime must not be
  // bundled by Next — let Node's normal resolution handle them.
  serverExternalPackages: [
    "pdfkit",
    // gRPC client for the Google Ads API (Keyword Planner).
    "google-ads-api",
    "better-sqlite3",
    "playwright",
    "playwright-core",
    "tesseract.js",
    // Native binding (.node file) inside js-binding.js — Turbopack 16
    // can't place it in an ESM chunk. Leaving as external lets Node's
    // standard require() handle it correctly at runtime.
    "@resvg/resvg-js",
    "satori",
    "qrcode",
  ],

  // Hide the dev-mode "Compiling…" bottom-left indicator. For self-hosters
  // running locally this is visual noise. Removed in production builds
  // automatically; this disables it in dev too.
  devIndicators: false,

  /**
   * Framing policy.
   *
   * The app set no frame headers at all, which meant any site could put
   * /settings or /clients in an invisible iframe and trick a logged-in
   * user into clicking things — classic clickjacking. It only became
   * obvious while adding a page that genuinely SHOULD be framed.
   *
   * So: deny framing everywhere, then carve out the one route designed
   * for it. `frame-ancestors *` on /embed is deliberate — an agency
   * embeds the grader on their own marketing site and we have no way to
   * know that hostname in advance. The route is safe to frame because it
   * exposes no account data and carries no session-authenticated
   * actions: it grades a URL the caller typed and writes a lead row.
   */
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
      {
        // Everything EXCEPT /embed. Next applies every matching rule, so
        // a plain `/:path*` catch-all also hit the embed route and its
        // X-Frame-Options: SAMEORIGIN won — the widget was served
        // unframeable, which silently breaks the entire feature: the
        // agency's iframe renders blank and nothing reports an error.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'",
          },
          // Not framing-related, but the same class of cheap header the
          // app was missing entirely.
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
