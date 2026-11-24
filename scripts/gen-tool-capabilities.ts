/**
 * Regenerates src/lib/tool-capabilities.generated.ts.
 *
 * Two things are derived here, both from code rather than from a list
 * somebody maintains:
 *
 *  1. Whether a route needs AI or a browser — from the import graph
 *     (see tool-capabilities.derive.ts).
 *  2. Each tool's name and description — for every tool in the registry
 *     (src/lib/tool-registry.ts), from the English messages, by the same
 *     rule Settings → Tools and search use (src/lib/i18n/tool-copy.ts).
 *     This used to parse the array out of tools-grid.tsx line by line,
 *     because it was module-private; a registry that can be imported
 *     deletes that parser.
 *
 * Run with `pnpm gen:capabilities`. tool-capabilities.test.ts fails when
 * the committed output and the code disagree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveToolCapabilities } from "../src/lib/tool-capabilities.derive";
import { resolveToolCopy, translatorFrom } from "../src/lib/i18n/tool-copy";
import { TOOLS } from "../src/lib/tool-registry";

export type ToolCopy = { title: string; description: string };

/**
 * Each registry tool's English name and description, read from the
 * message files. `root` is the repository root the files are read from.
 */
export function readToolCopy(root = process.cwd()): Map<string, ToolCopy> {
  const json = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(root, "messages", file), "utf8"));
  const en = json("en.json");
  const sources = {
    settings: translatorFrom(en.settings?.tools ?? {}),
    catalog: translatorFrom(json("tools-catalog.en.json")),
    nav: translatorFrom(en.nav?.items ?? {}),
  };
  const out = new Map<string, ToolCopy>();
  for (const t of TOOLS) {
    const copy = resolveToolCopy(t.href, sources);
    if (copy) out.set(t.href, copy);
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
// graph (see tool-capabilities.derive.ts) and by reading each registry
// tool's English copy from messages/. tool-capabilities.test.ts fails when
// this drifts.
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
