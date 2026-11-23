/**
 * The message templates the rules can produce, read from their sources
 * with the TypeScript parser: the second argument of every pass / warn /
 * fail / info call, as a template where `{0}`, `{1}`… stand for the
 * interpolated values. Both branches of a `cond ? a : b` are read.
 * Messages built from a variable (a list joined at run time) are not
 * templates and are left out.
 *
 * Node only. Used by the catalogue test (messages.fr.test.ts) and to
 * regenerate messages.fr.ts when rules change.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export type MessageTemplate = { ruleId: string; en: string; exprs: string[] };

function filesUnder(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return filesUnder(full);
    return full.endsWith(".ts") && !full.endsWith(".test.ts") ? [full] : [];
  });
}

export function extractMessageTemplates(rulesDir = path.join(process.cwd(), "src/audit/rules")): MessageTemplate[] {
  const out: MessageTemplate[] = [];
  const seen = new Set<string>();
  for (const file of filesUnder(rulesDir)) {
    const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const toTemplates = (node: ts.Expression): { en: string; exprs: string[] }[] | null => {
      let m = node;
      while (ts.isParenthesizedExpression(m)) m = m.expression;
      if (ts.isStringLiteral(m) || ts.isNoSubstitutionTemplateLiteral(m)) return [{ en: m.text, exprs: [] }];
      if (ts.isTemplateExpression(m)) {
        let en = m.head.text;
        const exprs: string[] = [];
        for (const span of m.templateSpans) {
          en += `{${exprs.length}}`;
          exprs.push(span.expression.getText(src));
          en += span.literal.text;
        }
        return [{ en, exprs }];
      }
      if (ts.isConditionalExpression(m)) {
        const a = toTemplates(m.whenTrue);
        const b = toTemplates(m.whenFalse);
        return a && b ? [...a, ...b] : (a ?? b);
      }
      return null;
    };
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["pass", "warn", "fail", "info"].includes(node.expression.text) &&
        node.arguments.length >= 2 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const ruleId = node.arguments[0].text;
        for (const t of toTemplates(node.arguments[1]) ?? []) {
          const key = `${ruleId}\u0000${t.en}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ ruleId, ...t });
        }
      }
      // Rules that return the result object themselves: { ruleId, message }.
      if (ts.isObjectLiteralExpression(node)) {
        const prop = (name: string) =>
          node.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
          );
        const idProp = prop("ruleId");
        const msgProp = prop("message");
        if (idProp && msgProp && ts.isStringLiteral(idProp.initializer)) {
          const ruleId = idProp.initializer.text;
          for (const t of toTemplates(msgProp.initializer) ?? []) {
            const key = `${ruleId}\u0000${t.en}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ ruleId, ...t });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return out;
}

/**
 * The English/French pairs a module writes with `tr(en, fr)` (the crawler,
 * src/lib/audit.ts, and its per-technology checks), as templates. Used to
 * read findings stored in English, before the crawler wrote French.
 */
export function extractTrPairs(file: string): { en: string; fr: string }[] {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const out: { en: string; fr: string }[] = [];
  const asTemplate = (node: ts.Expression): { text: string; exprs: string[] } | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, exprs: [] };
    if (!ts.isTemplateExpression(node)) return null;
    let text = node.head.text;
    const exprs: string[] = [];
    for (const span of node.templateSpans) {
      text += `{${exprs.length}}`;
      exprs.push(span.expression.getText(src));
      text += span.literal.text;
    }
    return { text, exprs };
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tr" && node.arguments.length === 2) {
      const en = asTemplate(node.arguments[0]);
      const fr = asTemplate(node.arguments[1]);
      // A French text built on expressions the English lacks (French
      // agreements such as "a"/"ont") cannot be rebuilt from an English
      // message: left out rather than rendered broken.
      if (en && fr && fr.exprs.every((e) => en.exprs.includes(e))) {
        // Number the French placeholders by the English expression they repeat.
        let frText = fr.text;
        fr.exprs.forEach((expr, i) => {
          const at = en.exprs.indexOf(expr);
          frText = frText.replace(`{${i}}`, at >= 0 ? `{§${at}}` : "");
        });
        out.push({ en: en.text, fr: frText.replace(/\{§(\d+)\}/g, "{$1}") });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}
