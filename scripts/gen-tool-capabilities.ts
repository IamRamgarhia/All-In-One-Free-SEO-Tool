/**
 * Regenerates src/lib/tool-capabilities.generated.ts.
 *
 * Two things are derived here, both from code rather than from a list
 * somebody maintains:
 *
 *  1. Whether a route needs AI or a browser — from the import graph
 *     (see tool-capabilities.derive.ts).
 *  2. Each tool's name and description — read out of the `tools` array in
 *     tools-grid.tsx, which is module-private and cannot be imported.
 *     Copying those strings into a docs file would have made a seventh
 *     hand-kept list in a repo that already has six, and the docs are the
 *     worst possible place to find out one of them drifted.
 *
 * Run with `pnpm gen:capabilities`. tool-capabilities.test.ts fails when
 * the committed output and the code disagree.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveToolCapabilities } from "../src/lib/tool-capabilities.derive";

export type ToolCopy = { title: string; description: string };

/** Pull { href, title, description } out of the tools-grid source. */
export function readToolCopy(root = process.cwd()): Map<string, ToolCopy> {
  const src = fs.readFileSync(
    path.join(root, "src/app/tools/tools-grid.tsx"),
    "utf8",
  );
  const out = new Map<string, ToolCopy>();

  // Parsed line by line rather than with one big pattern: a description
  // sits on the same line as its key or on the next one depending on
  // length, and that is precisely the case a single regex gets wrong.
  const lines = src.split(/\r?\n/);
  let href: string | null = null;
  let title: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const h = line.match(/^\s*href:\s*"([^"]+)"/);
    if (h) {
      href = h[1];
      title = null;
      continue;
    }

    const t = line.match(/^\s*title:\s*"(.*)",\s*$/);
    if (t) {
      title = t[1];
      continue;
    }

    if (/^\s*description:/.test(line) && href && title !== null) {
      const same = line.match(/description:\s*"(.*)",\s*$/);
      let raw: string | null = same ? same[1] : null;
      if (!same) {
        // Skip comments and blank lines before the string. /tools/crux
        // carries a five-line comment between the key and its value
        // explaining why the old wording was wrong; taking lines[i + 1]
        // blindly dropped that tool from the docs without a word.
        for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
          const l = lines[j].trim();
          if (l === "" || l.startsWith("//") || l.startsWith("*") || l.startsWith("/*"))
            continue;
          const m = lines[j].match(/^\s*"(.*)",\s*$/);
          raw = m ? m[1] : null;
          break;
        }
      }
      if (raw !== null) {
        out.set(href, {
          title: JSON.parse(`"${title}"`),
          description: JSON.parse(`"${raw}"`),
        });
      }
      href = null;
      title = null;
    }
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
