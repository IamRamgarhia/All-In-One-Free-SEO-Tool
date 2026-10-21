#!/usr/bin/env node
/**
 * Regenerate messages/tools-catalog.en.json from src/app/tools/tools-grid.tsx.
 * After editing the grid, run: node scripts/sync-tools-catalog.mjs
 * Then refresh messages/tools-catalog.fr.json (manual or your translation flow).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const grid = fs.readFileSync(
  path.join(root, "src/app/tools/tools-grid.tsx"),
  "utf8",
);
const re =
  /href:\s*"(\/tools\/[^"]+)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?description:\s*\n?\s*"([^"]+)"/g;
const out = {};
let m;
while ((m = re.exec(grid))) {
  const slug = m[1].replace(/^\/tools\//, "").replace(/\//g, "__");
  out[slug] = { title: m[2], description: m[3] };
}
fs.writeFileSync(
  path.join(root, "messages/tools-catalog.en.json"),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`Wrote ${Object.keys(out).length} tool entries to tools-catalog.en.json`);
