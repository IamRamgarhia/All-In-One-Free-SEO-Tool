import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sqlite } from "./client";

/**
 * Table rebuilds have to run with foreign keys genuinely off, and the
 * columns that point at our own tables have to be constrained.
 *
 * Background, because none of this announces itself. SQLite cannot ALTER
 * a constraint, so drizzle-kit adds one by rebuilding the table: CREATE
 * __new_x, copy the rows, DROP x, RENAME. It brackets that with
 * `PRAGMA foreign_keys=OFF` / `=ON`. SQLite only honours that pragma
 * when no transaction is pending — and scripts/migrate.cjs runs every
 * migration inside one — so the pragma was a no-op and the rebuild ran
 * with enforcement still on. Measured on a seeded copy:
 *
 *   - one pre-existing orphan aborts the whole migration, and because
 *     predev/prebuild run the migrator, the app then will not start.
 *   - `DROP TABLE uptime_targets` fires uptime_pings' ON DELETE CASCADE
 *     and deletes every ping, while the migration reports success. A
 *     bug that lies, which this project treats as the worse kind.
 *
 * 0075 was the first rebuild in the repo, so nothing was damaged before
 * it. These tests exist so the second one is safe too.
 */
const MIGRATIONS = path.join(process.cwd(), "src/db/migrations");
const RUNNER = path.join(process.cwd(), "scripts/migrate.cjs");

/** Migration files that rebuild a table, by the shape drizzle-kit emits. */
function rebuildMigrations(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => {
      const sql = readFileSync(path.join(MIGRATIONS, f), "utf8");
      return /CREATE TABLE\s+[`"]?__new_/i.test(sql) && /DROP TABLE/i.test(sql);
    });
}

/**
 * The runner's own detection regex, read out of its source rather than
 * restated here. A copy would be a second definition of the same thing,
 * free to drift from the one that actually runs — and every such pair in
 * this codebase had already drifted by the time it was found.
 */
function runnerDetectionRegex(): RegExp {
  const src = readFileSync(RUNNER, "utf8");
  const m = src.match(/needsFkOff\s*=\s*\/(.+?)\/([a-z]*)\s*\.test\(sql\)/);
  if (!m) throw new Error("could not find the needsFkOff regex in migrate.cjs");
  return new RegExp(m[1], m[2]);
}

/**
 * Columns named *_id that are deliberately not foreign keys, with the
 * reason. Anything else named *_id is expected to be constrained; a new
 * unconstrained one is how the seven orphans that prompted 0075 were
 * created in the first place.
 */
const NOT_FOREIGN_KEYS: Record<string, string> = {
  "activity_log.entity_id": "polymorphic — pairs with entity_type",
  "title_tests.wp_post_id": "a WordPress post id, not ours",
  "agent_actions.cms_revision_id": "an external CMS revision id, not ours",
};

describe("migration foreign-key safety", () => {
  it("finds the rebuild migrations", () => {
    // If this ever reads 0 the two tests below stop checking anything.
    expect(rebuildMigrations().length).toBeGreaterThan(0);
  });

  it("every rebuild migration is one the runner turns foreign keys off for", () => {
    const detects = runnerDetectionRegex();
    const undetected = rebuildMigrations().filter(
      (f) => !detects.test(readFileSync(path.join(MIGRATIONS, f), "utf8")),
    );
    expect(undetected).toEqual([]);
  });

  it("the runner disables enforcement outside the transaction and restores it", () => {
    const src = readFileSync(RUNNER, "utf8");
    // Inside sqlite.transaction(...) the pragma is silently ignored, so
    // the call has to sit before tx() — and the check afterwards is what
    // turns a bad rebuild into a rollback instead of a commit.
    expect(src).toMatch(/if \(needsFkOff\) sqlite\.pragma\("foreign_keys = OFF"\)/);
    expect(src).toMatch(/if \(needsFkOff\) sqlite\.pragma\("foreign_keys = ON"\)/);
    expect(src).toContain("PRAGMA foreign_key_check");
  });

  it("a freshly migrated database has no foreign key violations", () => {
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("enforces foreign keys on the connection", () => {
    // Without this the constraints are documentation. Set in db/client.ts.
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("constrains the six columns 0075 was written for", () => {
    const expected: Record<string, { parent: string; onDelete: string }> = {
      // Kept, not cascaded: this is the spend ledger, and deleting a
      // client should not make the lifetime AI cost total drop.
      ai_calls: { parent: "clients", onDelete: "SET NULL" },
      robots_snapshots: { parent: "clients", onDelete: "CASCADE" },
      uptime_targets: { parent: "clients", onDelete: "CASCADE" },
      redirect_rules: { parent: "clients", onDelete: "CASCADE" },
      not_found_log: { parent: "clients", onDelete: "CASCADE" },
      serp_feature_snapshots: { parent: "keywords", onDelete: "CASCADE" },
    };
    const actual: Record<string, { parent: string; onDelete: string } | null> = {};
    for (const table of Object.keys(expected)) {
      const fks = sqlite
        .prepare(`SELECT "table" AS parent, on_delete FROM pragma_foreign_key_list(?)`)
        .all(table) as { parent: string; on_delete: string }[];
      actual[table] = fks[0]
        ? { parent: fks[0].parent, onDelete: fks[0].on_delete }
        : null;
    }
    expect(actual).toEqual(expected);
  });

  it("has no unconstrained *_id column other than the documented ones", () => {
    const schema = readFileSync(path.join(process.cwd(), "src/db/schema.ts"), "utf8");
    const tableRe = /export const \w+ = sqliteTable\(\s*"([^"]+)"\s*,\s*\{/g;
    const starts: { table: string; from: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = tableRe.exec(schema)) !== null) {
      starts.push({ table: m[1], from: m.index });
    }

    const unconstrained: string[] = [];
    for (let i = 0; i < starts.length; i++) {
      const body = schema.slice(starts[i].from, starts[i + 1]?.from ?? schema.length);
      const colRe = /\w+:\s*integer\(\s*"([^"]+)"[\s\S]*?(?=\n  \w+:|\n\}\))/g;
      let c: RegExpExecArray | null;
      while ((c = colRe.exec(body)) !== null) {
        const [chunk, col] = [c[0], c[1]];
        if (!col.endsWith("_id")) continue;
        if (chunk.includes(".references(")) continue;
        if (chunk.includes("primaryKey")) continue;
        const key = `${starts[i].table}.${col}`;
        if (key in NOT_FOREIGN_KEYS) continue;
        unconstrained.push(key);
      }
    }
    expect(unconstrained).toEqual([]);
  });
});
