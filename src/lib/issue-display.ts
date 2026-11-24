/**
 * How a stored audit finding reads in the reader's language: its type's
 * name and its text. Findings keep what was stored; this only translates
 * what has a known French version, so audits stored in English read in
 * French too, and anything unknown is shown as it is.
 *
 * Types: the crawler's (`long_title`), the engine's (`seomator:<rule>`)
 * and the GEO audit's (`geo:<signal>`).
 */

import { translateCrawlerMessage, translateEngineMessage, translateStoredTitle } from "@/audit/engine/translate-message";
import { FIX_SUGGESTIONS_FR } from "@/audit/engine/fix-suggestions.fr";
import { getRuleById } from "@/audit/catalog";
import { CRAWLER_ISSUE_NAMES_FR } from "./crawler-issue-names.fr";
import { ruleNamesFr } from "./rule-names.fr";
import { GEO_TEXT_FR } from "./geo-audit/text.fr";
import geoFindings from "./geo-audit/data/findings.json";

type GeoEntry = { name?: string; title?: string };
const GEO: Record<string, GeoEntry> = {
  ...((geoFindings as { signals?: Record<string, GeoEntry> }).signals ?? {}),
  ...((geoFindings as { checks?: Record<string, GeoEntry> }).checks ?? {}),
};

/** The name of a finding type. */
export function issueTypeName(type: string, locale: string): string {
  const fr = locale === "fr";
  if (type.startsWith("seomator:")) {
    const id = type.slice("seomator:".length);
    return (fr ? ruleNamesFr[id] : undefined) ?? getRuleById(id)?.name ?? id;
  }
  if (type.startsWith("geo:")) {
    const entry = GEO[type.slice("geo:".length)];
    const en = entry?.name ?? entry?.title ?? type.slice("geo:".length);
    return fr ? (GEO_TEXT_FR[en] ?? en) : en;
  }
  if (fr && CRAWLER_ISSUE_NAMES_FR[type]) return CRAWLER_ISSUE_NAMES_FR[type];
  return type.replace(/_/g, " ");
}

/** A finding's message, in French when its text is known. */
export function issueMessage(type: string, message: string, locale: string): string {
  if (locale !== "fr") return message;
  if (type.startsWith("seomator:")) return translateEngineMessage(type.slice("seomator:".length), message);
  if (type.startsWith("geo:")) return GEO_TEXT_FR[message] ?? message;
  return translateCrawlerMessage(message);
}

/** A finding's fix, in French when its text is known. */
export function issueFix(type: string, fix: string, locale: string): string {
  if (locale !== "fr") return fix;
  if (type.startsWith("geo:")) return GEO_TEXT_FR[fix] ?? fix;
  if (type.startsWith("seomator:")) {
    const id = type.slice("seomator:".length);
    const en = FIX_SUGGESTIONS_FR[id];
    return en ?? fix;
  }
  return fix;
}

/**
 * A task title in the reader's language. Titles written from a finding
 * before the audit spoke the workspace language were stored in English;
 * known ones (engine, crawler, GEO audit) read in French, anything else
 * (titles people typed, templates already in French) is shown as stored.
 */
export function taskTitle(title: string, locale: string): string {
  if (locale !== "fr") return title;
  const pages = / \((\d+) pages\)$/.exec(title);
  const core = pages ? title.slice(0, pages.index) : title;
  const geo = GEO_TEXT_FR[core];
  if (geo) return pages ? `${geo}${pages[0]}` : geo;
  return translateStoredTitle(title);
}

