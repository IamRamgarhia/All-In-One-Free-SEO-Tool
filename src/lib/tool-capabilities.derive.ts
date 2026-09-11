/**
 * Works out, from the code itself, which pages need a model to write text
 * and which need headless Chromium.
 *
 * Every hand-maintained list in this codebase has drifted — the four
 * finding-name lists did, and there are six overlapping tool lists right
 * now, one of which carries a "keep in sync" comment it did not keep. So
 * this reads the import graph instead. Nothing here is written down, so
 * nothing here can go stale.
 *
 * Covers every route, not only /tools/*: the sidebar links to /agent,
 * /blog and /reports too, and those owe the reader the same "will this
 * cost me anything?" answer the tool cards give.
 *
 * Node-only — it reads the filesystem. The committed result lives in
 * tool-capabilities.generated.ts and a test asserts the two still agree,
 * so adding AI to a page fails the build until the badge is regenerated.
 */
import fs from "node:fs";
import path from "node:path";

export type DerivedCapability = {
  /** Route path as it appears in a link, e.g. "/tools/health-check". */
  route: string;
  /** A model has to produce words for this page to do its job. */
  needsAI: boolean;
  /**
   * How much of the page a model is actually load-bearing for.
   *
   * The import graph can see that a model is reachable. It cannot see
   * whether the answer depends on it, and that distinction was being
   * lost: `traffic-drop` is marked as needing AI and does not — it reads
   * Search Console, computes every number without a model, and asks one
   * only to write an optional prose sentence. The page told users it was
   * unavailable while working perfectly.
   *
   * So a file that reaches the AI client may declare `@ai-optional` or
   * `@ai-partial` in a comment, next to the code that knows. Nothing is
   * listed centrally, because every hand-kept list in this repo has
   * drifted.
   *
   *   "required" — nothing useful happens without a model. The default,
   *                because the safe error is telling someone a free tool
   *                costs money, never the reverse.
   *   "partial"  — some features need one, the rest work.
   *   "optional" — the answer is complete without one; a model only adds
   *                commentary.
   *   "none"     — never reaches a model at all.
   */
  aiUsage: "none" | "optional" | "partial" | "required";
  /** Drives headless Chromium — runs locally, costs no AI credits. */
  usesBrowser: boolean;
};

/**
 * Read the author's own statement about how load-bearing the model is.
 *
 * Deliberately a marker in the file that calls AI, rather than a table
 * somewhere else. CLAUDE.md's fourth standing rule exists because every
 * pair of lists in this codebase had already drifted by the time anyone
 * found it, and a central "these tools are optional" list would be the
 * seventh.
 */
function declaredAiUsage(
  files: readonly string[],
): "optional" | "partial" | null {
  for (const f of files) {
    let src = "";
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (/@ai-optional\b/.test(src)) return "optional";
    if (/@ai-partial\b/.test(src)) return "partial";
  }
  return null;
}

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
  const appDir = path.join(src, "app");

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

  const routes: DerivedCapability[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "page.tsx") continue;

      // Route groups — (marketing) — organise files without appearing in
      // the URL, so they are dropped here too.
      const segments = path
        .relative(appDir, dir)
        .split(path.sep)
        .filter(Boolean)
        .filter((seg) => !/^\(.*\)$/.test(seg));

      // A page's own actions.ts counts as part of it: that is where the
      // server work, and so the AI call, usually lives.
      const entries = [full, path.join(dir, "actions.ts")].filter((f) =>
        fs.existsSync(f),
      );

      const reachesAi = entries.some((f) => aiDependents.has(f));
      routes.push({
        route: segments.length === 0 ? "/" : `/${segments.join("/")}`,
        // Unchanged meaning: a model is reachable from here. Kept so the
        // existing badge and counts keep working while callers move over
        // to aiUsage.
        needsAI: reachesAi,
        aiUsage: reachesAi ? (declaredAiUsage(entries) ?? "required") : "none",
        usesBrowser: entries.some((f) => browserDependents.has(f)),
      });
    }
  })(appDir);

  return routes.sort((a, b) => a.route.localeCompare(b.route));
}
