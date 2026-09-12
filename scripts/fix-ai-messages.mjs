/**
 * Make every AI failure say what actually went wrong.
 *
 * `ai-error.ts` already classifies failures properly — out of quota,
 * rate limited, bad key, unknown model, timeout — each with a sentence
 * naming the fix. `lastAiFailure()` hands that to any caller who asks.
 *
 * Thirteen files did not ask. They printed a hardcoded "AI provider
 * didn't respond. Set up an API key in Settings." When a real Gemini key
 * hit its free-tier quota, every one of those tools told the user to set
 * up a key they had already set up.
 *
 * Same shape as the WordPress revision ids: the right answer existed and
 * the caller threw it away.
 *
 *   node scripts/fix-ai-messages.mjs [--check]
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CHECK = process.argv.includes("--check");

/** Every phrasing of the generic message found in the tree. */
const MESSAGES = [
  "AI provider didn't respond. Set up an API key in Settings.",
  "AI provider didn't respond. Configure a key in Settings.",
  "AI provider didn't respond. Check Settings → AI provider and confirm a key is configured.",
  "AI provider didn't respond. Check Settings → AI provider keys.",
  "AI provider didn't respond. Set up a key in Settings → AI provider.",
  "AI provider didn't respond. Configure one in Settings → API keys.",
  "AI provider didn't respond. Make sure you've configured one in Settings → AI.",
  "AI provider didn't respond. Set up a key in Settings.",
  "AI provider didn't respond. Configure one in Settings → AI, or click Test next to your provider to see the actual error.",
  "AI provider didn't respond. Open Settings → AI provider → click Test next to your provider to see the exact error.",
  "AI provider didn't respond",
  "AI provider didn't respond.",
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

let changed = 0;
const touched = [];

for (const file of walk(path.join(ROOT, "src"))) {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.split("\r\n").join("\n");
  if (!MESSAGES.some((m) => s.includes(m))) continue;
  // Already doing the right thing.
  if (s.includes("lastAiFailure")) continue;

  const before = s;
  for (const m of MESSAGES) {
    // The fallback keeps the original wording for the case where no
    // classification is available, so nothing gets worse.
    s = s.split(`"${m}"`).join(`lastAiFailure()?.message ?? "${m}"`);
  }
  if (s === before) continue;

  // Add the import beside the existing callAI one, whichever form it takes.
  const importRe =
    /import \{([^}]*?)\} from ("(?:\.\.?\/)*(?:@\/lib\/)?ai-call"|"@\/lib\/ai-call")/;
  const m = s.match(importRe);
  if (!m) {
    console.log(`SKIP ${path.relative(ROOT, file)} — no ai-call import found`);
    continue;
  }
  if (!m[1].includes("lastAiFailure")) {
    s = s.replace(
      importRe,
      (_full, names, from) =>
        `import {${names.trimEnd()}${names.trimEnd().endsWith(",") ? "" : ","} lastAiFailure } from ${from}`,
    );
  }

  if (crlf) s = s.split("\n").join("\r\n");
  if (!CHECK) fs.writeFileSync(file, s, "utf8");
  touched.push(path.relative(ROOT, file));
  changed++;
}

console.log(touched.map((t) => `  ${t}`).join("\n"));
console.log(`${CHECK ? "would change" : "changed"} ${changed} files`);
