import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Pure-logic tests only. Anything that opens the SQLite handle or
    // launches Chromium belongs in a separate (future) e2e project —
    // `pnpm test` has to stay fast enough to run on every commit.
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Points every worker at a throwaway database before any test file
    // is imported. Several of these tests import a module that opens
    // data.db at import time, and parallel workers — or a dev server
    // holding the same file — turned that into an intermittent
    // "disk I/O error" on a different test file every run.
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
