/**
 * Works out, from the code itself, which tools need a model to write text
 * and which need headless Chromium.
 *
 * Every hand-maintained list in this codebase has drifted — the four
 * finding-name lists did, and there are six overlapping tool lists right
 * now, one of which carries a "keep in sync" comment it did not keep. So
 * this reads the import graph instead. Nothing here is written down, so
 * nothing here can go stale.
 *
 * Node-only — it reads the filesystem. The committed result lives in
 * tool-capabilities.generated.ts and a test asserts the two still agree,
 * so adding AI to a tool fails the build until the badge is regenerated.
 */
import fs from "node:fs";
import path from "node:path";

export type DerivedCapability = {
  /** Directory name under src/app/tools, e.g. "health-check". */
  slug: string;
  /** A model has to produce words for this tool to do its job. */
  needsAI: boolean;
  /** Drives headless Chromium — runs locally, costs no AI credits. */
  usesBrowser: boolean;
};

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

/** import/export ... from "x", dynamic import("x"), and require("x"). */
const SPECIFIER_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveSpecifier(spec: string, fromFile: string, src: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package — not our graph
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

export function deriveToolCapabilities(): DerivedCapability[] {
  const root = repoRoot();
  const src = path.join(root, "src");
  const toolsDir = path.join(src, "app", "tools");

  const files = listSourceFiles(src);
  const text = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

  // importee -> importers. Reverse edges, so one walk from an entry module
  // finds everything that transitively depends on it.
  const importers = new Map<string, Set<string>>();
  for (const file of files) {
    for (const m of text.get(file)!.matchAll(SPECIFIER_RE)) {
      const target = resolveSpecifier(m[1], file, src);
      if (!target) continue;
      let set = importers.get(target);
      if (!set) importers.set(target, (set = new Set()));
      set.add(file);
    }
  }

  function dependents(entries: string[]): Set<string> {
    const seen = new Set<string>(entries);
    const queue = [...entries];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const dep of importers.get(cur) ?? []) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        queue.push(dep);
      }
    }
    return seen;
  }

  // Which modules actually spend credits? The ones that read a provider key
  // and call out — found by looking, not by listing. ai-call.ts is NOT the
  // only one: image-gen.ts posts straight to api.openai.com, and so do
  // ai-vision, llm-citation and provider-dispatch. Treating ai-call as the
  // sole entry point labelled image-gen "free", which is exactly the kind
  // of confidently-wrong answer this file exists to stop.
  const spendModules = files.filter(
    (f) =>
      /\bgetApiKey\s*\(/.test(text.get(f)!) &&
      f !== path.join(src, "lib", "api-keys.ts") &&
      !/\.test\.tsx?$/.test(f),
  );

  const aiDependents = dependents(spendModules);
  const browserDependents = dependents([path.join(src, "lib", "browser-pool.ts")]);

  return fs
    .readdirSync(toolsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const entries = ["page.tsx", "actions.ts", "page.ts", "actions.tsx"]
        .map((f) => path.join(toolsDir, e.name, f))
        .filter((f) => fs.existsSync(f));
      return {
        slug: e.name,
        needsAI: entries.some((f) => aiDependents.has(f)),
        usesBrowser: entries.some((f) => browserDependents.has(f)),
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}
