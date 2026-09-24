import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The control panel is one HTML page talking to one Node script, and
 * nothing type-checks the join between them. A button calling a task
 * the server doesn't have produces the worst failure this project has:
 * the page says "Backing up…", disables every button, and polls a log
 * that never gets a line. It looks like it is working.
 *
 * So the two halves are checked against each other here.
 *
 * Read this before editing: a task can be declared two ways —
 * `backup: async () => {}` and `async backup() {}`. While writing these
 * tests I grepped for only the first form, concluded the backup button
 * was dead, and was wrong. The extractor below handles both, because
 * the cost of getting this wrong is a confident false report about
 * whether a user's data is being saved.
 */

const ROOT = process.cwd();
const PANEL_JS = readFileSync(join(ROOT, "scripts", "control-panel.mjs"), "utf8");
const PANEL_HTML = readFileSync(join(ROOT, "scripts", "control-panel.html"), "utf8");

function serverTasks(): string[] {
  const start = PANEL_JS.indexOf("const TASKS = {");
  expect(start, "TASKS map not found in control-panel.mjs").toBeGreaterThan(-1);
  const body = PANEL_JS.slice(start, PANEL_JS.indexOf("\n};", start));
  const arrow = [...body.matchAll(/^ {2}([a-zA-Z_]+):\s*(?:async\s*)?\(/gm)];
  const shorthand = [...body.matchAll(/^ {2}(?:async\s+)?([a-zA-Z_]+)\s*\([a-zA-Z_ ,]*\)\s*\{/gm)];
  return [...new Set([...arrow, ...shorthand].map((m) => m[1]))];
}

/** Every task the page can ask for, from run('x') and run("x", …). */
function tasksThePageCalls(): string[] {
  const calls = [...PANEL_HTML.matchAll(/\brun\(\s*['"]([a-zA-Z_]+)['"]/g)];
  return [...new Set(calls.map((m) => m[1]))];
}

describe("control panel: page and server agree", () => {
  it("finds tasks declared either way", () => {
    // Guards the extractor itself. If this ever returns only the arrow
    // form again, every other assertion here silently weakens.
    const tasks = serverTasks();
    expect(tasks).toContain("start"); // `start: () => runBin("START")`
    expect(tasks).toContain("backup"); // `async backup() {`
  });

  it("every button calls a task the server implements", () => {
    const server = new Set(serverTasks());
    const missing = tasksThePageCalls().filter((t) => !server.has(t));
    expect(
      missing,
      `The page has buttons for ${missing.join(", ")}, which control-panel.mjs ` +
        `does not implement. Clicking one shows "Working…" forever.`,
    ).toEqual([]);
  });

  it("the whole advertised set is there", () => {
    // What the launcher and the README promise this one file can do.
    // A task quietly disappearing is a promise quietly broken.
    const server = new Set(serverTasks());
    for (const task of ["install", "start", "stop", "update", "backup", "restore"]) {
      expect(server.has(task), `the panel can no longer ${task}`).toBe(true);
    }
  });

  it("every task has a progress label, so none reads 'Working…'", () => {
    const labels = /\(\{\s*install:[\s\S]*?\}\)\[task\]/.exec(PANEL_HTML)?.[0] ?? "";
    for (const task of serverTasks()) {
      expect(labels.includes(`${task}:`), `no progress label for "${task}"`).toBe(true);
    }
  });

  it("restore is confirmed before it destroys anything", () => {
    // The one button that can lose data. If this ever stops asking,
    // a misclick on a desktop icon silently replaces a live database.
    const restoreFn = /function restore\(\)[\s\S]*?\n\}/.exec(PANEL_HTML)?.[0] ?? "";
    expect(restoreFn).toContain("window.confirm");
    expect(restoreFn).toMatch(/run\(['"]restore['"]/);
  });

  it("every task that touches this folder checks for Docker first", () => {
    // A Docker install keeps its database in a volume and runs the app in
    // a container. These tasks drive bin/START.*, bin/STOP.* and the
    // local data.db, so on a Docker install they would start a second
    // copy of the app against a different, empty database — and report
    // success. Each one has to ask before acting.
    const start = PANEL_JS.indexOf("const TASKS = {");
    const body = PANEL_JS.slice(start, PANEL_JS.indexOf("\n};", start));
    for (const task of ["install", "start", "stop", "update", "backup", "restore"]) {
      const from = body.search(new RegExp(`^ {2}(?:async )?${task}[:(]`, "m"));
      expect(from, `task "${task}" not found`).toBeGreaterThan(-1);
      // Up to the next top-level task declaration.
      const rest = body.slice(from + 1);
      const to = rest.search(/^ {2}(?:async )?[a-zA-Z_]+[:(]/m);
      const fn = to === -1 ? rest : rest.slice(0, to);
      expect(
        fn.includes("isDockerInstall"),
        `"${task}" does not check isDockerInstall(), so on a Docker ` +
          `install it would act on the wrong files and report success.`,
      ).toBe(true);
    }
  });

  it("the server never resolves a path the browser sent", () => {
    // Restore takes a filename over HTTP. It must be matched against
    // the known list, never joined onto disk directly.
    const fn = /async restore\(id\)[\s\S]*?\n {2}\},/.exec(PANEL_JS)?.[0] ?? "";
    expect(fn, "restore() not found in control-panel.mjs").not.toBe("");
    expect(fn).toContain("resolveBackup(id)");
  });
});
