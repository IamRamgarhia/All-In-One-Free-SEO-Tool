/**
 * Which tools run on their own, as data with no dependencies.
 *
 * Split out from `tool-sweep.ts` because the client rail needs to badge
 * these, and `tool-sweep.ts` imports the database — pulling it into a
 * client component drags better-sqlite3 into the browser bundle and
 * fails the build. Typecheck and the test suite both passed; only
 * `next build` caught it.
 *
 * This is a list of ids and nothing else, so importing it costs nothing
 * anywhere. `tool-sweep.ts` owns the actual runners and a test asserts
 * the two agree, so this cannot become the second list that drifts.
 */

export const SWEPT_TOOL_IDS = [
  "robots",
  "ai-robots",
  "security",
  "headers",
  "hreflang",
  "llms-txt",
  "freshness",
  "mobile-friendly",
  "schema-validate",
  "wp-hack-scan",
  "cannibalization",
  "traffic-drop",
] as const;

export type SweptToolId = (typeof SWEPT_TOOL_IDS)[number];
