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
  ],
};

export default nextConfig;
