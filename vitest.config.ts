import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Pure-logic tests only. Anything that opens the SQLite handle or
    // launches Chromium belongs in a separate (future) e2e project —
    // `pnpm test` has to stay fast enough to run on every commit.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
