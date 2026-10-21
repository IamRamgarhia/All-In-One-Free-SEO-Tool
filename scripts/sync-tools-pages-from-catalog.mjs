#!/usr/bin/env node
/**
 * Seed tools-pages.{en,fr}.json title/description from tools-catalog.*
 * Preserves extra keys already in tools-pages (tabs, labels, etc.).
 *
 *   node scripts/sync-tools-catalog.mjs
 *   node scripts/sync-tools-pages-from-catalog.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function readJson(p) {
  return JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
}

function writeJson(p, data) {
  fs.writeFileSync(path.join(root, p), `${JSON.stringify(data, null, 2)}\n`);
}

const catalogEn = readJson("messages/tools-catalog.en.json");
const catalogFr = readJson("messages/tools-catalog.fr.json");
let pagesEn = {};
let pagesFr = {};
try {
  pagesEn = readJson("messages/tools-pages.en.json");
  pagesFr = readJson("messages/tools-pages.fr.json");
} catch {
  /* first run */
}

for (const slug of Object.keys(catalogEn)) {
  pagesEn[slug] = {
    ...(pagesEn[slug] ?? {}),
    title: catalogEn[slug].title,
    description: catalogEn[slug].description,
  };

  const frMeta = catalogFr[slug] ?? catalogEn[slug];
  pagesFr[slug] = {
    ...(pagesFr[slug] ?? {}),
    title: frMeta.title,
    description: frMeta.description,
  };
}

writeJson("messages/tools-pages.en.json", pagesEn);
writeJson("messages/tools-pages.fr.json", pagesFr);
console.log(`Synced ${Object.keys(pagesEn).length} tool page entries.`);
