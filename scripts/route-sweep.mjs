/**
 * Load every page in the app and report the ones that break.
 *
 * The repo shipped for months with /tasks importing a package that
 * wasn't in package.json. The route 500'd the moment React tried to
 * render it, and nothing caught it — not typecheck, not the build, not
 * any server-side test, because the failure only happens when the page
 * actually renders. E2E covers a handful of routes. There are 226.
 *
 * So: walk src/app, derive every GET-able page URL, request each one,
 * and report anything that isn't a 200. It is a shallow test — it proves
 * a page renders, not that it renders the right thing — but "does every
 * screen in this product load at all" is a question worth being able to
 * answer in ninety seconds.
 *
 *   node scripts/route-sweep.mjs http://localhost:3000
 *
 * Dynamic segments are filled from real ids in the database when a path
 * is given, and skipped otherwise (a made-up id produces a legitimate
 * 404, which would be noise).
 *
 *   node scripts/route-sweep.mjs http://localhost:3000 ./data.db
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const DB_PATH = process.argv[3] ?? null;
const APP_DIR = "src/app";

/** Routes that are expected not to return 200 to an anonymous GET. */
const EXPECT_NON_200 = new Set([
  "/login", // 200, but redirects when already authed
]);

/**
 * Pages that legitimately 404 without query parameters.
 *
 * Both are "compare two things" screens: with no ids to compare there is
 * nothing to render, and `notFound()` is the correct answer. Supplying
 * real ids is the difference between the sweep reporting a bug and the
 * sweep actually testing the page — without this, two working pages show
 * up red forever and the report stops being worth reading.
 */
const REQUIRED_PARAMS = {
  "/audits/diff": (ids) =>
    ids.auditIdA && ids.auditIdB ? `?a=${ids.auditIdA}&b=${ids.auditIdB}` : null,
  "/snapshots/compare": (ids) =>
    ids.snapshotIdA && ids.snapshotIdB
      ? `?a=${ids.snapshotIdA}&b=${ids.snapshotIdB}`
      : null,
};

/**
 * Paths we deliberately do not sweep.
 *
 * Not "these are broken" — these have side effects or need context a
 * blind GET can't supply, and hitting them would be the script causing
 * damage rather than finding it.
 */
const SKIP_PREFIXES = [
  "/api/", // exercised by auth-check + the app itself; many are POST-only
  "/portal/", // needs a real share token
  "/invite/", // needs a real invite token
  "/r/", // short-link redirector, needs a real slug
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry === "page.tsx" || entry === "route.ts") out.push(full);
  }
  return out;
}

/** src/app/keywords/c/[clientId]/page.tsx -> /keywords/c/[clientId] */
function toRoute(file) {
  let r = relative(APP_DIR, file).split(sep).slice(0, -1).join("/");
  // Route groups "(marketing)" don't appear in the URL.
  r = r
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/");
  return "/" + r;
}

function fillParams(route, ids) {
  return route.replace(/\[(\.{3})?(\w+)\]/g, (_m, spread, name) => {
    if (spread) return ids.clientId ?? "1";
    const lower = name.toLowerCase();
    if (lower.includes("client")) return ids.clientId ?? "";
    if (lower === "id" || lower.endsWith("id")) return ids[name] ?? "";
    return "";
  });
}

async function loadIds() {
  if (!DB_PATH) return {};
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true });
    const one = (sql) => {
      try {
        return db.prepare(sql).get()?.id ?? null;
      } catch {
        return null;
      }
    };
    /** Two ids from the same table, for the compare pages. */
    const pair = (table) => {
      try {
        const rows = db
          .prepare(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 2`)
          .all();
        return rows.length === 2 ? [rows[1].id, rows[0].id] : [null, null];
      } catch {
        return [null, null];
      }
    };
    const [auditIdA, auditIdB] = pair("audits");
    const [snapshotIdA, snapshotIdB] = pair("tool_snapshots");
    const ids = {
      clientId: one("SELECT id FROM clients ORDER BY id LIMIT 1"),
      id: one("SELECT id FROM clients ORDER BY id LIMIT 1"),
      auditId: one("SELECT id FROM audits ORDER BY id DESC LIMIT 1"),
      keywordId: one("SELECT id FROM keywords ORDER BY id LIMIT 1"),
      taskId: one("SELECT id FROM tasks ORDER BY id LIMIT 1"),
      auditIdA,
      auditIdB,
      snapshotIdA,
      snapshotIdB,
    };
    db.close();
    return Object.fromEntries(
      Object.entries(ids).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    );
  } catch (e) {
    console.log(`  (couldn't read ids from ${DB_PATH}: ${e.message})`);
    return {};
  }
}

async function main() {
  const ids = await loadIds();
  console.log(`Route sweep against ${BASE}`);
  console.log(
    `Dynamic ids: ${Object.keys(ids).length ? JSON.stringify(ids) : "none — dynamic routes will be skipped"}\n`,
  );

  const files = walk(APP_DIR).filter((f) => f.endsWith("page.tsx"));
  const routes = [...new Set(files.map(toRoute))].sort();

  const results = { ok: [], broken: [], skipped: [], slow: [] };

  for (const route of routes) {
    if (SKIP_PREFIXES.some((p) => route.startsWith(p))) {
      results.skipped.push([route, "side effects or needs a token"]);
      continue;
    }

    let url = fillParams(route, ids);
    if (url.includes("[") || url.includes("//")) {
      results.skipped.push([route, "no id available for its dynamic segment"]);
      continue;
    }

    if (route in REQUIRED_PARAMS) {
      const qs = REQUIRED_PARAMS[route](ids);
      if (!qs) {
        results.skipped.push([route, "needs two rows to compare; not enough data"]);
        continue;
      }
      url += qs;
    }

    const started = Date.now();
    let status = 0;
    let note = "";
    try {
      const res = await fetch(BASE + url, {
        headers: { accept: "text/html" },
        redirect: "manual",
      });
      status = res.status;
      if (status >= 300 && status < 400) {
        note = `-> ${res.headers.get("location") ?? "?"}`;
      }
    } catch (e) {
      note = e.message;
    }
    const ms = Date.now() - started;

    const isOk =
      status === 200 ||
      (status >= 300 && status < 400) ||
      (status === 404 && EXPECT_NON_200.has(route));

    if (isOk) {
      results.ok.push([url, status, ms]);
      // A page nobody can wait for is a page nobody uses. 8s is the
      // threshold at which a first-time visitor assumes it's hung.
      if (ms > 8000) results.slow.push([url, ms]);
    } else {
      results.broken.push([url, status, note, ms]);
    }
    process.stdout.write(isOk ? "." : "X");
  }

  console.log("\n");
  console.log("=".repeat(72));
  console.log(
    `${results.ok.length} loaded, ${results.broken.length} broken, ${results.skipped.length} skipped`,
  );
  console.log("=".repeat(72));

  if (results.broken.length) {
    console.log("\nBROKEN:");
    for (const [url, status, note, ms] of results.broken) {
      console.log(`  ${String(status).padEnd(4)} ${url}  ${note} (${ms}ms)`);
    }
  }

  if (results.slow.length) {
    console.log("\nSLOW (>8s — a first-time visitor assumes these have hung):");
    for (const [url, ms] of results.slow.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(ms).padStart(6)}ms  ${url}`);
    }
  }

  if (results.skipped.length) {
    console.log(`\nSKIPPED (${results.skipped.length}):`);
    const byReason = new Map();
    for (const [route, reason] of results.skipped) {
      byReason.set(reason, [...(byReason.get(reason) ?? []), route]);
    }
    for (const [reason, list] of byReason) {
      console.log(`  ${reason}: ${list.length}`);
      for (const r of list.slice(0, 8)) console.log(`      ${r}`);
      if (list.length > 8) console.log(`      … and ${list.length - 8} more`);
    }
  }

  process.exit(results.broken.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("CRASHED:", e);
  process.exit(1);
});
