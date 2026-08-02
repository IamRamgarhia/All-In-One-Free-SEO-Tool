import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Project-specific:
    "dist/**",
    "src/db/migrations/**",
  ]),

  // `.cjs` files are CommonJS by definition — `require()` is the only
  // way to import in them. The TS rule that bans it is aimed at ESM
  // sources and has nothing useful to say here.
  //
  // These deliberately run before any bundler or TS tooling exists
  // (scripts/migrate.cjs is invoked by the Docker entrypoint and the
  // predev/prebuild hooks; bin/*.cjs ship in the packaged install), so
  // they can't be converted to ESM without breaking that.
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // An underscore prefix means "this binding is deliberately unused".
  // Needed for parameters whose position is fixed by a signature — a
  // callback that only wants the third argument, or a function keeping a
  // parameter for API parity. Without this the only ways to silence the
  // warning are to delete a parameter that must stay, or to scatter
  // eslint-disable comments; the convention is clearer than either.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },

  // `react-hooks/purity` flags `Date.now()` / `new Date()` during render.
  // That is the right call in a Client Component, where render can run
  // many times and must be deterministic for hydration to match.
  //
  // It does not hold for React Server Components. These run once per
  // request on the server, never hydrate, and reading the clock is the
  // whole point — "audits from the last 7 days", "how stale is this
  // data", "good morning vs good evening". There is nothing to make
  // deterministic and no second render to disagree with.
  //
  // The rule can't currently distinguish the two, so the files below
  // opt out individually rather than via a glob. Listing them by name
  // is deliberate: if one ever gains "use client", it has to be removed
  // from this list, and the rule starts protecting it again.
  {
    files: [
      "src/app/agency-week.tsx",
      "src/app/audits/page.tsx",
      "src/app/automations/overview/page.tsx",
      // Square brackets are glob character-class syntax, so Next's
      // dynamic-segment directories can't be named literally here.
      "src/app/link-building/c/*/page.tsx",
      "src/app/morning/page.tsx",
      "src/app/settings/health/page.tsx",
      "src/components/ui/freshness-badge.tsx",
    ],
    rules: {
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
