/**
 * Regenerates src/lib/tool-capabilities.generated.ts.
 *
 * Two things are derived here, both from code rather than from a list
 * somebody maintains:
 *
 *  1. Whether a route needs AI or a browser — from the import graph
 *     (see tool-capabilities.derive.ts).
 *  2. Each tool's name and description — imported from
 *     src/lib/tool-registry.ts. Copying those strings into a docs file
 *     would have made another hand-kept list in a repo that already had
 *     four, and the docs are the worst possible place to find out one of
 *     them drifted.
 *
 *     This previously said the array was "module-private and cannot be
 *     imported", and parsed it out of the tsx by regex because of that.
 *     Making it importable was the fix for three real defects at once:
 *     ten tools in no surface, eight retired tools still advertised by
 *     global search, and this parser.
 *
 * Run with `pnpm gen:capabilities`. tool-capabilities.test.ts fails when
 * the committed output and the code disagree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveToolCapabilities } from "../src/lib/tool-capabilities.derive";
import { TOOLS } from "../src/lib/tool-registry";

export type ToolCopy = { title: string; description: string };

/**
 * Each tool's name and description, from the registry.
 *
 * This used to parse them out of tools-grid.tsx line by line, because
 * the array was module-private and could not be imported. That parser
 * needed a twelve-line lookahead to skip comments between a key and its
 * value, and its own comment recorded the bug it shipped: taking the
 * next line blindly "dropped that tool from the docs without a word".
 *
 * The array now lives in src/lib/tool-registry.ts and is exported, so
 * this reads it directly. `root` is kept for signature compatibility
 * with the test that calls this, and is unused: an import resolves
 * against this file, not the working directory.
 */
export function readToolCopy(_root = process.cwd()): Map<string, ToolCopy> {
  const out = new Map<string, ToolCopy>();
  for (const t of TOOLS) {
    out.set(t.href, { title: t.title, description: t.description });
  }
  return out;
}

/**
 * The generated source, as a string.
 *
 * Deliberately not written to disk here. `tool-capabilities.test.ts`
 * imports `readToolCopy` from this file, and while the write ran at
 * module level that import regenerated the very file the test asserts
 * against: a run that failed because someone added a route and did not
 * regenerate would repair itself on the way out, and the second run was
 * green. The drift was real and the suite had already erased the
 * evidence — the exact shape of failure this repo tests hardest against.
 */
export function renderCapabilities(root = process.cwd()): string {
  const caps = deriveToolCapabilities();
  const copy = readToolCopy(root);

  const rows = caps
    .map((c) => {
      const t = copy.get(c.route);
      const extra = t
        ? `, title: ${JSON.stringify(t.title)}, description: ${JSON.stringify(t.description)}`
        : "";
      return `  { route: ${JSON.stringify(c.route)}, needsAI: ${c.needsAI}, aiUsage: ${JSON.stringify(c.aiUsage)}, usesBrowser: ${c.usesBrowser}${extra} },`;
    })
    .join("\n");

  const tools = caps.filter((c) => /^\/tools\/[^/]+$/.test(c.route));
  const documented = tools.filter((c) => copy.has(c.route)).length;

  return `// GENERATED FILE — do not edit by hand.
// Run \`pnpm gen:capabilities\` to refresh. Derived by walking the import
// graph (see tool-capabilities.derive.ts) and by reading the tool copy out
// of tools-grid.tsx. tool-capabilities.test.ts fails when this drifts.
//
// ${caps.length} routes · ${caps.filter((c) => c.needsAI).length} need AI · ${caps.filter((c) => c.usesBrowser).length} use a browser.
// ${tools.length} are /tools/* · ${tools.filter((c) => c.needsAI).length} need AI · ${documented} carry copy.

export const TOOL_CAPABILITIES = [
${rows}
] as const;
`;
}

// Only when run as a script. See the note on renderCapabilities.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = path.resolve(
    process.cwd(),
    "src/lib/tool-capabilities.generated.ts",
  );
  fs.writeFileSync(dest, renderCapabilities(), "utf8");
  console.log(`wrote ${dest}`);
}
