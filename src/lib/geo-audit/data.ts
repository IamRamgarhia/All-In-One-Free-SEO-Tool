import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");

const cache = new Map<string, unknown>();

export function load(name: string): Record<string, unknown> {
  const hit = cache.get(name);
  if (hit !== undefined) {
    return hit as Record<string, unknown>;
  }
  const raw = readFileSync(join(DATA_DIR, `${name}.json`), "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  cache.set(name, parsed);
  return parsed;
}

export function dataVersion(): string {
  return (load("meta") as { data_version: string }).data_version;
}

export function tiers(): Array<{ label: string; min: number; meaning: string }> {
  return (load("tiers") as { tiers: Array<{ label: string; min: number; meaning: string }> })
    .tiers;
}

export function tierFor(score: number): { label: string; min: number; meaning: string } {
  for (const tier of tiers()) {
    if (score >= tier.min) return tier;
  }
  return tiers()[tiers().length - 1]!;
}

export function weights(): Record<
  string,
  { weight: number; signals: Record<string, { class: string; max: number }> }
> {
  return (load("weights") as {
    categories: Record<
      string,
      { weight: number; signals: Record<string, { class: string; max: number }> }
    >;
  }).categories;
}

export function thresholds(section: string): Record<string, unknown> {
  return (load("thresholds") as Record<string, Record<string, unknown>>)[section]!;
}

export function crawlers(): Array<{ token: string; critical: boolean }> {
  return (load("ai_crawlers") as { crawlers: Array<{ token: string; critical: boolean }> })
    .crawlers;
}

export function findingTemplate(kind: string, key: string): Record<string, unknown> {
  const findings = load("findings") as Record<string, Record<string, unknown>>;
  return findings[kind]![key] as Record<string, unknown>;
}
