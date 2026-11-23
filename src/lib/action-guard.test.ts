import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Any server action can be POSTed by id to any page, the public ones
 * included, so each action must check the sign-in itself: every export
 * of a "use server" file, and every function with its own "use server".
 */

// Public by design: they check a share token or are meant for strangers.
const PUBLIC_FILES = new Set([
  "src/app/embed/grader/actions.ts",
  "src/app/portal/[token]/chat-actions.ts",
  "src/app/portal/[token]/quote-actions.ts",
]);

// Read by the root layout and the shell on every page, the login page
// included. They answer signed-out callers with a neutral value instead.
const OPEN_READS = new Set([
  "getConnectionMode",
  "getAiConnectionStatus",
  "getThemePreference",
  "getLocalePreference",
]);

type Fn = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function hasUseServer(statements: ts.NodeArray<ts.Statement>): boolean {
  return statements.some(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isStringLiteral(s.expression) &&
      s.expression.text === "use server",
  );
}

/** `await requireSignedIn();` as a statement of the function body itself. */
function checksSignIn(fn: Fn): boolean {
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  return fn.body.statements.some(
    (s) =>
      ts.isExpressionStatement(s) &&
      ts.isAwaitExpression(s.expression) &&
      ts.isCallExpression(s.expression.expression) &&
      ts.isIdentifier(s.expression.expression.expression) &&
      s.expression.expression.expression.text === "requireSignedIn",
  );
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function isAsync(fn: Fn): boolean {
  return Boolean(ts.getModifiers(fn)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword));
}

/** Names of the actions in one file that do not check the sign-in. */
function unguardedActions(file: string, src: string): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const out: string[] = [];

  // Every exported async function of a "use server" file is an action.
  if (hasUseServer(sf.statements)) {
    for (const st of sf.statements) {
      if (!isExported(st)) continue;
      const fns: [string, Fn][] = [];
      if (ts.isFunctionDeclaration(st) && st.name) fns.push([st.name.text, st]);
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) {
          const init = d.initializer;
          if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            fns.push([d.name.text, init]);
          }
        }
      }
      for (const [name, fn] of fns) {
        if (isAsync(fn) && !OPEN_READS.has(name) && !checksSignIn(fn)) out.push(name);
      }
    }
  }

  // A function with its own "use server" is an action wherever it lives.
  const visit = (node: ts.Node) => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
      node.body &&
      ts.isBlock(node.body) &&
      hasUseServer(node.body.statements) &&
      !checksSignIn(node)
    ) {
      const name =
        (ts.isFunctionDeclaration(node) && node.name?.text) ||
        `inline action at line ${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
      out.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe("server actions", () => {
  const root = process.cwd();
  const files = sourceFiles(path.join(root, "src"))
    .map((f) => path.relative(root, f).split(path.sep).join("/"))
    .filter((f) => !PUBLIC_FILES.has(f));

  it("finds the action files", () => {
    const actionFiles = files.filter((f) =>
      readFileSync(path.join(root, f), "utf8").startsWith('"use server"'),
    );
    expect(actionFiles.length).toBeGreaterThan(100);
  });

  it("each action checks the sign-in", () => {
    const unguarded = files.flatMap((file) =>
      unguardedActions(file, readFileSync(path.join(root, file), "utf8")).map(
        (name) => `${file}: ${name}`,
      ),
    );
    expect(unguarded).toEqual([]);
    // Parses every action file in the tree: a little over 5s on a slow
    // machine during a full parallel run, which is vitest's default limit.
  }, 30_000);

  it("does not take a comment or a string for the check", () => {
    const src = `"use server";
export async function a() {
  // await requireSignedIn();
  const s = "await requireSignedIn();";
}
export async function b() {
  await requireSignedIn();
}
export function c() {
  async function inner() {
    "use server";
  }
}`;
    expect(unguardedActions("x.ts", src)).toEqual(["a", "inner"]);
  });
});
