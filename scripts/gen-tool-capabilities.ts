/**
 * Regenerates src/lib/tool-capabilities.generated.ts from the import graph.
 * Run with `pnpm gen:capabilities`. A test fails if the committed file and
 * the code disagree, so this has to be re-run when a tool starts or stops
 * using AI.
 */
import fs from "node:fs";
import path from "node:path";
import { deriveToolCapabilities } from "../src/lib/tool-capabilities.derive";

const caps = deriveToolCapabilities();
const rows = caps
  .map(
    (c) =>
      `  { slug: ${JSON.stringify(c.slug)}, needsAI: ${c.needsAI}, usesBrowser: ${c.usesBrowser} },`,
  )
  .join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Run \`pnpm gen:capabilities\` to refresh. Derived by walking the import
// graph (see tool-capabilities.derive.ts): a tool needs AI if it can reach
// a module that reads a provider key, and uses a browser if it can reach
// the Chromium pool. tool-capabilities.test.ts fails when this drifts.
//
// ${caps.length} tools · ${caps.filter((c) => c.needsAI).length} need AI · ${caps.filter((c) => c.usesBrowser).length} use a browser.

export const TOOL_CAPABILITIES = [
${rows}
] as const;
`;

const dest = path.resolve(process.cwd(), "src/lib/tool-capabilities.generated.ts");
fs.writeFileSync(dest, out, "utf8");
console.log(`wrote ${caps.length} rows to ${path.relative(process.cwd(), dest)}`);
