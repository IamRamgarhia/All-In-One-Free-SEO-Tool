/**
 * Every AI provider the app can read from the environment has to be
 * documented in the two places people look for it.
 *
 * WHY THIS TEST EXISTS: PR #60, from an outside contributor, added one
 * line — `MISTRAL_API_KEY` to `docker-compose.yml` and `.env.example`.
 * Mistral had been a first-class provider for months: `api-keys.ts`
 * maps it, `api-providers.ts` declares its `envVar`, the Settings UI
 * offers it, and `provider-dispatch.ts` calls it. The only thing
 * missing was the documentation, so on Docker the single way to use it
 * was opening Settings and pasting a key again after every `docker
 * compose down -v`, while every other provider could be pre-seeded.
 *
 * Nothing was broken, which is why it lasted. An undocumented
 * environment variable does not throw — it is simply never set.
 *
 * Measuring the gap after merging that PR found four more missing from
 * compose and five from `.env.example`: DeepSeek, Cerebras, Together AI
 * and GitHub Models, plus Perplexity in `.env.example` alone. Three
 * hand-kept lists of one declared source, which is CLAUDE.md's fourth
 * standing rule, found already-drifted for the fifth time in this
 * codebase.
 *
 * So the source of truth is PROVIDER_CATALOG and the docs are held to
 * it. A provider added there now fails the build until both files
 * mention it, which costs thirty seconds and is the only moment anyone
 * will remember to do it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROVIDER_CATALOG } from "./api-providers";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

const FILES = [
  ["docker-compose.yml", "a Docker install cannot pre-set it"],
  [".env.example", "nobody reading the example env file learns it exists"],
] as const;

describe("AI provider environment variables", () => {
  it("finds providers to check, or this test proves nothing", () => {
    // A vacuous pass is the risk: an empty or renamed catalogue would
    // make every loop below hold over nothing.
    expect(PROVIDER_CATALOG.length).toBeGreaterThanOrEqual(10);
    for (const p of PROVIDER_CATALOG) {
      expect(p.envVar, `${p.id} declares no envVar`).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });

  it.each(FILES)("%s documents every provider", (file, consequence) => {
    const text = read(file);
    const missing = PROVIDER_CATALOG.filter((p) => !text.includes(p.envVar)).map(
      (p) => `${p.label} (${p.envVar})`,
    );
    expect(
      missing,
      `${file} does not mention ${missing.join(", ")}. The app reads ` +
        `those from the environment, so ${consequence}.`,
    ).toEqual([]);
  });

  it("documents nothing the app would not read", () => {
    // The other direction, and the one that wastes someone's afternoon:
    // a variable documented in compose that no code reads looks like a
    // feature. Checked against the catalogue AND api-keys.ts, since a
    // provider can legitimately be read by one and not the other.
    const known = new Set([
      ...PROVIDER_CATALOG.map((p) => p.envVar),
      // Not AI providers, and deliberately in these files.
      ...[
        "APP_PASSWORD",
        "SEO_ALLOW_NO_PASSWORD",
        "SEO_BIND_ADDR",
        "SEO_DATA_DIR",
        "SEO_DB_PATH",
        "SEO_PORT",
        "SEO_INSTALL_MODE",
        "PAGESPEED_API_KEY",
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_OAUTH_CLIENT_SECRET",
        "BRAVE_API_KEY",
        "SEARXNG_URL",
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASS",
        "SMTP_FROM",
        "ENCRYPTION_KEY",
        "NODE_ENV",
      ],
    ]);
    const providerish = /\b([A-Z][A-Z0-9_]*(?:_API_KEY|_TOKEN))\b/g;
    for (const [file] of FILES) {
      const found = new Set([...read(file).matchAll(providerish)].map((m) => m[1]));
      const unknown = [...found].filter((v) => !known.has(v));
      expect(
        unknown,
        `${file} documents ${unknown.join(", ")}, which nothing in ` +
          `PROVIDER_CATALOG reads. Either wire it up or stop advertising it.`,
      ).toEqual([]);
    }
  });

  it("compose passes each one through rather than hardcoding a value", () => {
    // `GEMINI_API_KEY: sk-...` in a committed file is a leaked key; the
    // `${VAR:-}` form reads it from the host's environment and defaults
    // to empty. Every line here is commented out, so this guards the
    // shape people will uncomment and copy.
    const compose = read("docker-compose.yml");
    for (const p of PROVIDER_CATALOG) {
      if (p.envVar === "OLLAMA_URL") continue; // a URL, not a secret
      const line = compose
        .split("\n")
        .find((l) => l.includes(`${p.envVar}:`));
      expect(line, `${p.envVar} has no line in docker-compose.yml`).toBeTruthy();
      expect(
        line,
        `${p.envVar} in docker-compose.yml is not the \${VAR:-} ` +
          `pass-through form — a literal here would be a committed secret`,
      ).toContain(`\${${p.envVar}:-}`);
    }
  });
});
