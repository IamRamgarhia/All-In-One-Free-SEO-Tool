import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server build under .next/standalone — the
  // packaging script copies it into dist/ alongside a bundled Node binary
  // so end-users can run the app by double-clicking, no Node install required.
  output: "standalone",

  // Native modules and ones that load files from disk at runtime must not be
  // bundled by Next — let Node's normal resolution handle them.
  serverExternalPackages: [
    "pdfkit",
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
