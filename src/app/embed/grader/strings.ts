/**
 * Every word of the public grader widget (`/embed/grader`), in each
 * interface language.
 *
 * The widget sits in an iframe on the agency's own site and is read by
 * the agency's prospects, who have no session and no language cookie
 * here. So it speaks the workspace language (Settings → General, read
 * with `getReportLocale`), the same one the agency's reports use: the
 * page reads it on the server and hands the locale to the client
 * component, and the server actions read it again for their errors.
 *
 * A typed table, like report-i18n.ts: several entries take a count or
 * the agency's name, and a missing translation is a compile error.
 */

import type { Locale } from "@/i18n/config";
import { CRAWLER_ISSUE_NAMES_FR } from "@/lib/crawler-issue-names.fr";

const en = {
  pageTitle: (brand: string) => `Free SEO audit — ${brand}`,
  title: "Free SEO audit",
  tagline: (agency: string) => `A 10-second health check from ${agency}.`,
  urlPlaceholder: "yourwebsite.com",
  urlLabel: "Your website address",
  checking: "Checking…",
  check: "Check my site",
  running: "Fetching the page and running 19 checks…",
  homepageOnly: "Checks the homepage only. A full audit covers every page.",
  worthFixing: (n: number) => `${n} issue${n === 1 ? "" : "s"} worth fixing first`,
  noSerious: "No serious issues on the homepage",
  smaller: (n: number) => `${n} smaller`,
  thanks: (agency: string) => `Thanks — ${agency} will be in touch with the full breakdown.`,
  wantFull: "Want the full report?",
  wantFullHint: (agency: string) =>
    `This checked your homepage. Leave an email and ${agency} will send the full audit — every page, with what to fix first.`,
  namePlaceholder: "Your name (optional)",
  nameLabel: "Your name",
  emailPlaceholder: "you@company.com",
  emailLabel: "Your email",
  saveFailed: "Couldn't save that.",
  send: "Send it",
  // Server action errors
  badUrl: "That doesn't look like a website address.",
  rateLimited: (mins: number) =>
    `That's a few audits in quick succession. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
  unreachable: "Couldn't reach that site. Check it loads in a browser and retry.",
  rerun: "Something went wrong — re-run the audit.",
  badEmail: "That email doesn't look right.",
};

export type GraderWidgetStrings = typeof en;

const fr: GraderWidgetStrings = {
  pageTitle: (brand) => `Audit SEO gratuit — ${brand}`,
  title: "Audit SEO gratuit",
  tagline: (agency) => `Un bilan de santé en 10 secondes, offert par ${agency}.`,
  urlPlaceholder: "votresite.fr",
  urlLabel: "Adresse de votre site",
  checking: "Analyse…",
  check: "Analyser mon site",
  running: "Chargement de la page et exécution de 19 contrôles…",
  homepageOnly: "Seule la page d’accueil est analysée. Un audit complet couvre toutes les pages.",
  worthFixing: (n) =>
    n === 1 ? "1 problème à corriger en priorité" : `${n} problèmes à corriger en priorité`,
  noSerious: "Aucun problème sérieux sur la page d’accueil",
  smaller: (n) => (n === 1 ? "1 point mineur" : `${n} points mineurs`),
  thanks: (agency) => `Merci ! ${agency} vous enverra le détail complet.`,
  wantFull: "Vous voulez le rapport complet ?",
  wantFullHint: (agency) =>
    `Cette analyse porte sur votre page d’accueil. Laissez votre e-mail et ${agency} vous enverra l’audit complet : toutes les pages, avec les priorités de correction.`,
  namePlaceholder: "Votre nom (facultatif)",
  nameLabel: "Votre nom",
  emailPlaceholder: "vous@entreprise.fr",
  emailLabel: "Votre e-mail",
  saveFailed: "Enregistrement impossible.",
  send: "Recevoir le rapport",
  badUrl: "Cette adresse de site ne semble pas valide.",
  rateLimited: (mins) =>
    `Plusieurs analyses viennent d’être lancées à la suite. Réessayez dans ${mins} minute${mins === 1 ? "" : "s"}.`,
  unreachable: "Impossible d’atteindre ce site. Vérifiez qu’il s’ouvre dans un navigateur, puis réessayez.",
  rerun: "Une erreur est survenue : relancez l’analyse.",
  badEmail: "Cette adresse e-mail ne semble pas valide.",
};

const STRINGS: Record<Locale, GraderWidgetStrings> = { en, fr };

export function graderWidgetStrings(locale: Locale): GraderWidgetStrings {
  return STRINGS[locale] ?? en;
}

/**
 * The name of a finding's type in French, for the line shown above the
 * crawler's message; null in English, where the message says it all.
 */
export function findingName(type: string, locale: Locale): string | null {
  if (locale !== "fr") return null;
  return CRAWLER_ISSUE_NAMES_FR[type] ?? null;
}
