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

/** The message in French when its template is known, else unchanged. */
export function translateEngineMessage(ruleId: string, message: string): string {
  const list = catalogue().get(ruleId);
  if (!list) return message;
  for (const c of list) {
    const m = c.re.exec(message);
    if (m) return c.fr.replace(/\{@(\d+)\}/g, (_, i: string) => m[Number(i) + 1] ?? "");
  }
  return message;
}
