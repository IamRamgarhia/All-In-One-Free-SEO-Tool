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

/**
 * Items the rules build and join into one value ("; " or ", "), then
 * interpolate: "Render-blocking resources found: {0}" where {0} is
 * "1 script(s) in <head> without async/defer". Not templates of their own
 * (messages.fr.ts only holds what a pass/warn/fail call receives), so
 * they are listed here. translate-message.test.ts checks this list
 * against the rule sources it covers.
 */
export const ITEMS_FR: { en: string; fr: string }[] = [
  // performance/render-blocking.ts
  { en: "{0} render-blocking scripts in <head>", fr: "{0} scripts bloquant le rendu dans le <head>" },
  { en: "{0} script(s) in <head> without async/defer", fr: "{0} script(s) dans le <head> sans async ni defer" },
  { en: "{0} large inline script(s) ({1}KB total)", fr: "{0} script(s) en ligne volumineux ({1} Ko au total)" },
  { en: "{0} CSS files in head (consider critical CSS extraction)", fr: "{0} fichiers CSS dans le <head> (envisagez d’extraire le CSS critique)" },
  // performance/css-file-size.ts
  { en: "{0} external CSS files (recommended: <={1})", fr: "{0} fichiers CSS externes (recommandé : {1} au plus)" },
  { en: "{0} external CSS files - consider bundling", fr: "{0} fichiers CSS externes : envisagez de les regrouper" },
  { en: "{0}KB inline CSS (recommended: <{1}KB)", fr: "{0} Ko de CSS en ligne (recommandé : moins de {1} Ko)" },
  { en: "{0}KB inline CSS - consider extracting to external file", fr: "{0} Ko de CSS en ligne : envisagez de le déplacer dans un fichier externe" },
  { en: "No external CSS files (inline only)", fr: "Aucun fichier CSS externe (CSS en ligne uniquement)" },
  { en: "{0} CSS file(s), {1}KB inline", fr: "{0} fichier(s) CSS, {1} Ko en ligne" },
  // performance/lcp-hints.ts
  { en: "no preload or fetchpriority", fr: "ni preload ni fetchpriority" },
  { en: "missing preload", fr: "preload absent" },
  { en: 'missing fetchpriority="high"', fr: 'fetchpriority="high" absent' },
  // images/figure-captions.ts (the whole message is the joined list)
  { en: "{0} figure(s) missing figcaption", fr: "{0} élément(s) figure sans figcaption" },
  { en: "{0} figure(s) without images", fr: "{0} élément(s) figure sans image" },
  // schema/local-business.ts, schema/article.ts
  { en: "{0}: missing required fields: {1}", fr: "{0} : champs obligatoires absents : {1}" },
  { en: "{0}: missing recommended fields: {1}", fr: "{0} : champs recommandés absents : {1}" },
  { en: "{0}: address missing fields: {1}", fr: "{0} : champs d’adresse absents : {1}" },
  { en: "{0}: geo missing fields: {1}", fr: "{0} : coordonnées géographiques absentes : {1}" },
  { en: "{0}: address should be PostalAddress object, not string", fr: "{0} : address devrait être un objet PostalAddress, pas une chaîne de texte" },
  { en: "{0}: author should be a Person or Organization object, not a plain string", fr: "{0} : author devrait être un objet Person ou Organization, pas une simple chaîne de texte" },
  // performance/asset-size.ts (unsizedReason)
  {
    en: "{0} stylesheet(s) were served without a content-length header (chunked or HTTP/2 framing), so their size could not be read",
    fr: "{0} feuille(s) de style servie(s) sans en-tête Content-Length (transfert par blocs ou trames HTTP/2) : leur taille n’a pas pu être lue",
  },
  {
    en: "{0} script(s) were served without a content-length header (chunked or HTTP/2 framing), so their size could not be read",
    fr: "{0} script(s) servi(s) sans en-tête Content-Length (transfert par blocs ou trames HTTP/2) : leur taille n’a pas pu être lue",
  },
  // content/utils/syllable-counter.ts (readability bands)
  { en: "Very Easy (5th grade)", fr: "très facile (niveau fin d’école primaire)" },
  { en: "Easy (6th grade)", fr: "facile (niveau sixième)" },
  { en: "Fairly Easy (7th grade)", fr: "assez facile (niveau cinquième)" },
  { en: "Standard (8th-9th grade)", fr: "standard (niveau quatrième-troisième)" },
  { en: "Fairly Difficult (10th-12th grade)", fr: "assez difficile (niveau lycée)" },
  { en: "Difficult (college level)", fr: "difficile (niveau études supérieures)" },
  { en: "Very Difficult (college graduate)", fr: "très difficile (niveau diplômé du supérieur)" },
];

let items: Compiled[] | null = null;

function itemCatalogue(): Compiled[] {
  if (!items) items = ITEMS_FR.map((e) => compile(e.en, e.fr)).sort((a, b) => b.literal - a.literal);
  return items;
}

function translateItem(text: string): string | null {
  for (const c of itemCatalogue()) {
    const m = c.re.exec(text);
    if (m) return c.fr.replace(/\{@(\d+)\}/g, (_, i: string) => frenchNumbers(m[Number(i) + 1] ?? ""));
  }
  return null;
}

/** "95.7" → "95,7": a value that is a decimal number, and nothing else. */
const DECIMAL = /^-?\d+\.\d+$/;

/**
 * French number and unit typography inside a value: decimal comma for a
 * value that is just a number, "170KB" → "170 Ko" (no-break space), and
 * the "…, and 7 more" the rules append to long lists. URLs are left
 * alone: only whole-value numbers and unit-suffixed numbers change.
 */
function frenchNumbers(value: string): string {
  if (DECIMAL.test(value)) return value.replace(".", ",");
  return value
    .replace(/\b(\d+(?:\.\d+)?)\s?(KB|MB)\b/g, (_, n: string, unit: string) =>
      `${n.replace(".", ",")}\u00a0${unit === "KB" ? "Ko" : "Mo"}`,
    )
    .replace(/, and (\d+) more$/, (_, n: string) => `, et ${n} autre${Number(n) > 1 ? "s" : ""}`);
}

/** A value joined from items: each part translated when it is known. */
function translateList(value: string): string | null {
  const whole = translateItem(value);
  if (whole !== null) return whole;
  for (const sep of ["; ", ", "]) {
    if (!value.includes(sep)) continue;
    const parts = value.split(sep);
    const fr = parts.map((p) => translateItem(p));
    // French puts a space before a semicolon.
    if (fr.some((p) => p !== null)) return parts.map((p, i) => fr[i] ?? p).join(sep === "; " ? " ; " : sep);
  }
  return null;
}

function translateValue(value: string, ruleId?: string): string {
  for (const [re, fr] of FRAGMENTS) {
    const m = re.exec(value);
    if (m) return fr(m);
  }
  const listed = translateList(value);
  if (listed !== null) return frenchNumbers(listed);
  // A value that is itself one of this rule's messages (minify-css puts
  // its inline-CSS verdict after the external one).
  if (ruleId && value.length > 3) {
    const own = translateEngineMessage(ruleId, value, true);
    if (own !== value) return own;
  }
  return frenchNumbers(value);
}

/** French spacing: a no-break space before %, never a plain one. */
function frenchSpacing(text: string): string {
  return text.replace(/(\d) %/g, "$1\u00a0%");
}

/**
 * " (N pages)": added when one finding is found on several pages
 * (lib/seomator-audit.ts, collapseSiteWide). Not part of any template, so
 * it is set aside while matching and put back after.
 */
const PAGES_SUFFIX = / \((\d+) pages\)$/;

/** The message in French when its template is known, else unchanged. */
export function translateEngineMessage(ruleId: string, message: string, nested = false): string {
  const suffix = PAGES_SUFFIX.exec(message);
  if (suffix) return `${translateEngineMessage(ruleId, message.slice(0, suffix.index), nested)}${suffix[0]}`;
  const list = catalogue().get(ruleId) ?? [];
  for (const c of list) {
    const m = c.re.exec(message);
    if (m) {
      return frenchSpacing(
        c.fr.replace(/\{@(\d+)\}/g, (_, i: string) =>
          translateValue(m[Number(i) + 1] ?? "", nested ? undefined : ruleId),
        ),
      );
    }
  }
  // Some rules report the joined list itself as the message
  // (figure-captions): translated only when every part is known.
  if (!nested) {
    const parts = message.split("; ");
    const fr = parts.map((p) => translateItem(p));
    if (fr.every((p) => p !== null)) return frenchSpacing(fr.join(" ; "));
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

let everyEngine: Compiled[] | null = null;

/** Up to the first period followed by a space (or the end), period dropped. */
function sentenceOne(text: string): string {
  const end = /[.!?](?=\s|$)/.exec(text);
  return end ? text.slice(0, end.index) : text;
}

/**
 * Every engine and crawler template, plus its first sentence alone: task titles are
 * the first sentence of a finding ("Meta description is too short (112
 * characters)" from "… (112 characters). Aim for 120–160."). A first
 * sentence is only kept when its French side uses no placeholder that
 * its English side lost, so a value is never dropped from the French.
 */
function engineTitles(): Compiled[] {
  if (everyEngine) return everyEngine;
  const out: Compiled[] = [];
  for (const e of [...ENGINE_MESSAGES_FR, ...CRAWLER_MESSAGES_FR]) {
    if (!e.fr) continue;
    out.push(compile(e.en, e.fr));
    const en1 = sentenceOne(e.en);
    const fr1 = sentenceOne(e.fr);
    if (en1 === e.en) continue;
    const enSlots = new Set(en1.match(/\{\d+\}/g) ?? []);
    if ((fr1.match(/\{\d+\}/g) ?? []).every((slot) => enSlots.has(slot))) out.push(compile(en1, fr1));
  }
  everyEngine = out.sort((a, b) => b.literal - a.literal);
  return everyEngine;
}

/**
 * A task title stored in English, in French, when it is the first
 * sentence of a known engine or crawler finding. Task titles keep no rule
 * id, so every template is tried, most specific first. Unknown titles
 * come back unchanged.
 */
export function translateStoredTitle(title: string): string {
  const suffix = PAGES_SUFFIX.exec(title);
  if (suffix) return `${translateStoredTitle(title.slice(0, suffix.index))}${suffix[0]}`;
  for (const candidate of [title, `${title}.`]) {
    const viaCrawler = translateCrawlerMessage(candidate);
    if (viaCrawler !== candidate) return sentenceOne(viaCrawler);
    for (const c of engineTitles()) {
      const m = c.re.exec(candidate);
      if (m) return sentenceOne(c.fr.replace(/\{@(\d+)\}/g, (_, i: string) => translateValue(m[Number(i) + 1] ?? "")));
    }
  }
  return title;
}
