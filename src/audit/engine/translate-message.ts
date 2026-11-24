/**
 * French text of the engine's finding messages, applied when they are
 * shown or stored, not when the rules run: the rules stay as ported (their
 * English output is what the parity test against the original engine
 * compares), and audits stored before this existed read in French too.
 *
 * The catalogue (messages.fr.ts) is extracted from the rule sources: one
 * entry per message template, `{0}`, `{1}`… standing for the values the
 * rule interpolated. A message is matched against its rule's templates;
 * the French template gets the same values back. A message that matches
 * none (a list joined from several issues, a rule changed since the
 * extraction) stays in English rather than being guessed.
 */

import { ENGINE_MESSAGES_FR } from "./messages.fr";
import { CRAWLER_MESSAGES_FR } from "@/lib/crawler-messages.fr";

type Compiled = { re: RegExp; fr: string; literal: number };

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(en: string, fr: string): Compiled {
  const pieces = en.split(/\{(\d+)\}/);
  let pattern = "";
  let literal = 0;
  const order: number[] = [];
  for (let i = 0; i < pieces.length; i++) {
    if (i % 2 === 0) {
      pattern += escape(pieces[i]);
      literal += pieces[i].length;
    } else {
      order.push(Number(pieces[i]));
      pattern += "([\\s\\S]*?)";
    }
  }
  // Placeholders are captured in order of appearance; the French template
  // refers to them by their original number.
  const frByPosition = fr.replace(/\{(\d+)\}/g, (_, n: string) => {
    const at = order.indexOf(Number(n));
    return at >= 0 ? `{@${at}}` : "";
  });
  return { re: new RegExp(`^${pattern}$`), fr: frByPosition, literal };
}

let byRule: Map<string, Compiled[]> | null = null;

function catalogue(): Map<string, Compiled[]> {
  if (byRule) return byRule;
  byRule = new Map();
  for (const e of ENGINE_MESSAGES_FR) {
    if (!e.fr) continue;
    const list = byRule.get(e.ruleId) ?? [];
    list.push(compile(e.en, e.fr));
    byRule.set(e.ruleId, list);
  }
  // Most specific first: "Title is too long (62…)" must not be read by a
  // template that is all placeholder.
  for (const list of byRule.values()) list.sort((a, b) => b.literal - a.literal);
  return byRule;
}

/**
 * Values that are themselves English fragments, built by the rules around
 * a placeholder (" in footer", "high"). Whole-value matches only.
 */
const FRAGMENTS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^ in navigation$/, () => " dans la navigation"],
  [/^ in footer$/, () => " dans le pied de page"],
  [/^ with structured data$/, () => " avec données structurées"],
  [/^ \(FTC compliant language\)$/, () => " (formulation conforme aux règles de la FTC)"],
  [/^ \((\d+) contact methods? visible\)$/, (m) => ` (${m[1]} moyen(s) de contact visible(s))`],
  [/^ with (\d+) editorial signals?$/, (m) => ` avec ${m[1]} signal(aux) éditorial(aux)`],
  [/^high$/, () => "élevée"],
  [/^medium$/, () => "moyenne"],
  [/^low$/, () => "faible"],
];

function translateValue(value: string): string {
  for (const [re, fr] of FRAGMENTS) {
    const m = re.exec(value);
    if (m) return fr(m);
  }
  return value;
}

/**
 * " (N pages)": added when one finding is found on several pages
 * (lib/seomator-audit.ts, collapseSiteWide). Not part of any template, so
 * it is set aside while matching and put back after.
 */
const PAGES_SUFFIX = / \((\d+) pages\)$/;

/** The message in French when its template is known, else unchanged. */
export function translateEngineMessage(ruleId: string, message: string): string {
  const suffix = PAGES_SUFFIX.exec(message);
  if (suffix) return `${translateEngineMessage(ruleId, message.slice(0, suffix.index))}${suffix[0]}`;
  const list = catalogue().get(ruleId);
  if (!list) return message;
  for (const c of list) {
    const m = c.re.exec(message);
    if (m) return c.fr.replace(/\{@(\d+)\}/g, (_, i: string) => translateValue(m[Number(i) + 1] ?? ""));
  }
  return message;
}

let crawler: Compiled[] | null = null;

/**
 * A crawler finding stored in English (before the crawler wrote the
 * workspace language), in French. Per-technology findings keep their
 * "[Next.js] " prefix.
 */
export function translateCrawlerMessage(message: string): string {
  if (!crawler) {
    crawler = CRAWLER_MESSAGES_FR.map((e) => compile(e.en, e.fr)).sort((a, b) => b.literal - a.literal);
  }
  const suffix = PAGES_SUFFIX.exec(message);
  if (suffix) return `${translateCrawlerMessage(message.slice(0, suffix.index))}${suffix[0]}`;
  const prefix = /^\[[^\]]+\] /.exec(message)?.[0] ?? "";
  const body = message.slice(prefix.length);
  for (const c of crawler) {
    const m = c.re.exec(body);
    if (m) return prefix + c.fr.replace(/\{@(\d+)\}/g, (_, i: string) => m[Number(i) + 1] ?? "");
  }
  return message;
}
