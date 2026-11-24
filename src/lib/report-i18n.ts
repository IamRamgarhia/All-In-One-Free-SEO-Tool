/**
 * Every word of the PDF report (report-generator.ts) and of the template
 * executive summary (ai-summary.ts), in each interface language.
 *
 * The report used to be English only, whatever language the workspace
 * was set to. The language is now the workspace's (`ui.locale`, set in
 * Settings → General), read by the generator itself so that downloads,
 * scheduled emails and batch runs agree.
 *
 * A typed table rather than messages/*.json: most entries take numbers
 * and plurals, and a missing translation is a compile error here.
 *
 * Glyphs: the report draws with PDFKit's built-in Helvetica (WinAnsi),
 * which has no arrows (→ ▲ ▼ ↑ ↓), no check mark and no narrow no-break
 * space. The old report printed "!'" where an arrow should have been.
 * Strings here stay inside WinAnsi, and numbers and dates go through
 * `num` / `date`, which swap the narrow space French formatting uses.
 */

import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getSetting } from "./settings-store";

export type ReportTemplateId = "executive" | "detailed" | "technical" | "ceo" | "cmo" | "cto" | "junior";
type Severity = "critical" | "high" | "medium" | "low";
type Priority = "high" | "medium" | "low";

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

const en = {
  intlLocale: "en-US",
  /** Label/value separator: French puts a space before the colon. */
  colon: ": ",
  docTitle: (client: string) => `${client} - SEO report`,
  docSubject: "Monthly SEO performance report",
  docAuthor: "SEO report",
  templates: {
    executive: "Executive",
    detailed: "Detailed",
    technical: "Technical",
    ceo: "CEO - revenue and ROI",
    cmo: "CMO - traffic and pipeline",
    cto: "CTO - technical health",
    junior: "Junior marketer - what's been done",
  } satisfies Record<ReportTemplateId, string>,
  framing: {
    executive: "Headline progress and the next month's priorities.",
    detailed: "Full report: every metric, every section.",
    technical: "Audit-first view. Focus on issues found and fixed.",
    ceo: "Revenue and ROI summary. Leads with traffic value, not vanity metrics.",
    cmo: "Traffic and pipeline view. What's converting, where to invest content next.",
    cto: "Technical health view. Audit issues, what shipped, what's pending engineering.",
    junior: "What's been done this period: work log and accomplishments for hand-off or stand-up.",
  } satisfies Record<ReportTemplateId, string>,

  // Cover
  coverScoreLabel: "Health score / 100",
  coverDelta: (delta: string, prev: number) => `${delta} vs previous (${prev})`,
  preparedFor: "PREPARED FOR",
  reportPeriod: "REPORT PERIOD",
  preparedBy: (name: string) => `Prepared by ${name}`,

  // Header page
  seoReport: "SEO REPORT",
  period: (p: string) => `Period: ${p}`,
  template: (t: string) => `Template: ${t}`,
  healthScore: "HEALTH SCORE",
  of100: "of 100",
  vsLastAudit: (delta: string) => `${delta} vs last audit`,

  // Executive summary
  execSummary: "Executive summary",
  planLine: (week: number, total: number, phase: string | null, done: number, planned: number, overdue: number) =>
    `Week ${week} of ${total}${phase ? ` - ${phase}` : ""}: ${done} of ${planned} planned items complete${
      overdue > 0 ? `, ${overdue} overdue` : ""
    }`,
  planPatience:
    "Search engines take roughly 60 to 90 days to re-crawl, re-evaluate and move pages, so the work in this period shows up around month three. For now the honest measure of progress is the plan above, not the traffic line below.",
  dataBehind: "DATA BEHIND THIS SUMMARY",
  templateSummaryNote: "(Summary generated from a template: no AI provider configured.)",

  // Performance over time
  performanceOverTime: "Performance over time",
  sinceBaseline: (date: string, days: number) => `Since baseline (${date}, about ${days} days ago):`,
  sinceSnapshot: (date: string) => `Since last snapshot (${date}):`,
  rowHealthScore: "Health score",
  rowClicks: "Organic clicks (28 days)",
  rowImpressions: "Organic impressions (28 days)",
  rowSessions: "GA4 sessions (28 days)",
  rowConversions: "GA4 conversions (28 days)",
  rowRevenue: "Organic revenue (28 days, $)",
  rowTop10: "Top-10 keywords",
  rowBacklinks: "Backlinks (logged)",
  rowGbp: "Business Profile playbook %",
  fromTo: (a: string, b: string) => `${a} to ${b}`,

  // Highlights
  highlights: "Performance highlights",
  auditsCompleted: "Audits completed this period",
  tasksCompleted: "Tasks completed",
  tasksOf: (done: number, total: number) => `${done} of ${total}`,
  openIssues: "Open issues from latest audit",
  organicSessions28: "Organic sessions (28 days)",
  vsPrior: (pct: string) => ` (${pct} vs prior)`,
  techStack: "Tech stack",
  notDetected: "Not detected",

  // Traffic
  trafficTitle: "Organic traffic - last 28 days",
  sessions: "Sessions",
  users: "Users",
  pageviews: "Pageviews",
  weekOverWeek: "Week over week",
  googleUpdates: (labels: string, more: number) =>
    `Dashed lines mark Google updates: ${labels}${more > 0 ? ` (+${more} more)` : ""}`,

  // Keywords
  topKeywordsGsc: "Top keywords (Search Console, 28 days)",
  topKeywords: "Top organic keywords",
  clicksPos: (clicks: string, pos: string) => `${clicks} clicks, position ${pos}`,
  colQuery: "QUERY",
  colClicks: "CLICKS",
  colImpr: "IMPR.",
  colCtr: "CTR",
  colPos: "POS.",
  quickWins: "Quick wins - keywords ranking 4 to 15",
  quickWinsHint:
    "Sitting just outside page 1 with real impressions. One tweak can push them onto page 1, where click-through jumps from under 2% to 5-12%.",

  // Issues
  issuesBySeverity: "Issues by severity",
  severity: { critical: "CRITICAL", high: "HIGH", medium: "MEDIUM", low: "LOW" } satisfies Record<Severity, string>,
  more: (n: number) => `+ ${n} more`,
  onPages: (n: number) => (n === 1 ? "1 page" : `${n} pages`),
  morePages: (n: number) => (n === 1 ? "+ 1 more page" : `+ ${n} more pages`),
  moreRules: (n: number) => (n === 1 ? "+ 1 more issue type" : `+ ${n} more issue types`),
  foundByTools: "Found by the tools",
  foundByToolsHint: "Checks that run on their own between audits, and that look at things a single crawl does not.",
  foundBy: (tool: string) => `found by ${tool}`,

  // Work
  workCompleted: "Work completed this period",
  noTasksDone: "No tasks marked complete in this period.",
  linksLost: "Links lost this period",
  linksLostCount: (n: number) => `${n} ${plural(n, "link", "links")} no longer found`,
  linksLostHint:
    "Each source page was checked twice and the link was not there either time. These are usually the cheapest links to win back: the publisher already decided once that the site was worth linking to.",
  anchor: (a: string) => `anchor: "${a}"`,
  lastSeen: (d: string) => `last seen ${d}`,
  linksBuilt: "Links built this period",
  linksPlaced: (n: number) => `${n} ${plural(n, "link", "links")} placed`,
  dofollowAvg: (n: number, avg: number | null) => `${n} dofollow${avg !== null ? `, average DA ${avg}` : ""}`,
  hubLive: "Backlink hub - links marked live",
  hubCount: (n: number) => `${n} ${plural(n, "link", "links")} from your tracker`,
  unknown: "(unknown)",
  guestPosts: "Guest posts published",
  guestCount: (n: number) => `${n} guest ${plural(n, "post", "posts")} live`,
  target: (k: string) => `target: ${k}`,
  rankMovement: "Rank movement this period",
  rankSummary: (up: number, down: number) => `${up} ${plural(up, "keyword", "keywords")} moved up, ${down} dropped`,
  rankRow: (prior: number | null, current: number | null, delta: string) => `  #${prior ?? "-"} to #${current ?? "-"} (${delta})`,
  /** A keyword that left (or entered) the results read: the side with no position says how far, on which engine. */
  rankRowOut: (prior: number, absent: string) => `  #${prior} to ${absent}`,
  rankRowIn: (absent: string, current: number) => `  ${absent} to #${current}`,
  rankAbsent: {
    gsc: "no Search Console impressions",
    first: (count: number, engine: string) =>
      count === 1 ? `absent from the first result (${engine})` : `absent from the first ${count} results (${engine})`,
    read: (engine: string) => `absent from the results read (${engine})`,
    engines: {
      searxng: "SearXNG",
      brave: "Brave Search",
      duckduckgo: "DuckDuckGo",
      google: "Google",
      unknown: "engine not recorded",
    },
  },
  pageChanges: "Page changes detected",
  fieldChanged: (field: string, critical: boolean) => `${critical ? "Critical: " : ""}${field} changed`,
  changedOn: (url: string, date: string) => `  on ${url}, ${date}`,
  unknownUrl: "(unknown URL)",
  aiApplied: "AI suggestions applied",
  aiAppliedCount: (n: number) => `${n} ${plural(n, "suggestion", "suggestions")} applied this period.`,

  // Next steps
  recommendations: "Recommendations for the next period",
  noRecommendations: "No open recommendations. Run a new audit for fresh suggestions.",
  priority: { high: "HIGH PRIORITY", medium: "MEDIUM PRIORITY", low: "LOW PRIORITY" } satisfies Record<Priority, string>,
  covers: "What this report covers",
  coversTechnical:
    "Technical template: every issue across all crawled pages, with affected URLs. Use it for an engineering hand-off or to check before and after a deployment.",

  // Footer
  footerBrand: (name: string, when: string) => `Prepared by ${name}, ${when}`,
  footerLocal: (when: string) => `Generated on ${when}, self-hosted instance`,

  // Template executive summary (ai-summary.ts)
  summary: {
    steady: (c: string, s: number) => `${c}'s health score held steady at ${s}/100 this period.`,
    up: (c: string, d: number, s: number) => `${c}'s health score improved by ${d} points this period to ${s}/100.`,
    down: (c: string, d: number, s: number) => `${c}'s health score dropped ${d} points this period to ${s}/100.`,
    baseline: (c: string, s: number) => `${c} now has a baseline health score of ${s}/100, its first measurement.`,
    none: (c: string) => `${c} has no completed audit yet.`,
    closed: (d: number, t: number) => `We closed ${d} of ${t} open SEO tasks.`,
    queued: (t: number) => `${t} SEO ${plural(t, "task is", "tasks are")} queued, with no completions logged yet.`,
    next: (issue: string) => `Next focus: ${issue}.`,
    dpHealth: "Health score",
    dpHealthDelta: (s: number, d: string, prev: number) => `${s} / 100 (${d} vs last audit, was ${prev})`,
    dpHealthFirst: (s: number) => `${s} / 100 (first measurement)`,
    dpTasks: "Tasks",
    dpTasksValue: (done: number, open: number, total: number) => `${done} done / ${open} open / ${total} total`,
    dpTopIssue: (sev: string) => `Top issue (${sev})`,
    dpOtherIssues: "Other issues surfaced",
    dpOtherIssuesValue: (n: number, list: string) => `${n} more (${list})`,
    dpSessions: "Organic sessions (last 28 days)",
    dpSessionsTrend: (pct: string) => ` (${pct} vs prior 28 days)`,
    dpTopQuery: "Top organic query",
    dpTopQueryValue: (q: string, clicks: number, pos: string) => `"${q}": ${clicks} clicks at position ${pos}`,
    dpQuickWins: "Quick-win keywords (positions 4-15)",
    dpTech: "Detected tech stack",
    dpNiche: "Niche",
    severity: { critical: "critical", high: "high", medium: "medium", low: "low" } as Record<string, string>,
    aiLanguage: "Write the summary in English.",
  },
};

export type ReportStrings = typeof en;

const fr: ReportStrings = {
  intlLocale: "fr-FR",
  colon: "\u00a0: ",
  docTitle: (client) => `${client} - rapport SEO`,
  docSubject: "Rapport mensuel de performance SEO",
  docAuthor: "Rapport SEO",
  templates: {
    executive: "Exécutif",
    detailed: "Détaillé",
    technical: "Technique",
    ceo: "Dirigeant - chiffre d'affaires et ROI",
    cmo: "Marketing - trafic et prospects",
    cto: "Technique - santé du site",
    junior: "Équipe - travail réalisé",
  },
  framing: {
    executive: "L'essentiel des progrès et les priorités du mois prochain.",
    detailed: "Rapport complet : chaque indicateur, chaque section.",
    technical: "Vue centrée sur l'audit : les problèmes trouvés et corrigés.",
    ceo: "Synthèse chiffre d'affaires et ROI. La valeur du trafic avant les indicateurs de vanité.",
    cmo: "Vue trafic et prospects : ce qui convertit, où investir dans le contenu.",
    cto: "Vue santé technique : problèmes d'audit, ce qui a été livré, ce qui attend l'équipe technique.",
    junior: "Ce qui a été fait sur la période : journal de travail et réalisations, pour une passation ou un point d'équipe.",
  },

  coverScoreLabel: "Score de santé / 100",
  coverDelta: (delta, prev) => `${delta} par rapport au précédent (${prev})`,
  preparedFor: "PRÉPARÉ POUR",
  reportPeriod: "PÉRIODE",
  preparedBy: (name) => `Préparé par ${name}`,

  seoReport: "RAPPORT SEO",
  period: (p) => `Période : ${p}`,
  template: (t) => `Modèle : ${t}`,
  healthScore: "SCORE DE SANTÉ",
  of100: "sur 100",
  vsLastAudit: (delta) => `${delta} depuis le dernier audit`,

  execSummary: "Synthèse",
  planLine: (week, total, phase, done, planned, overdue) =>
    `Semaine ${week} sur ${total}${phase ? ` - ${phase}` : ""} : ${done} sur ${planned} actions prévues réalisées${
      overdue > 0 ? `, ${overdue} en retard` : ""
    }`,
  planPatience:
    "Les moteurs de recherche mettent environ 60 à 90 jours à réexplorer, réévaluer et reclasser les pages : le travail de cette période se verra vers le troisième mois. Pour l'instant, la mesure honnête des progrès est le plan ci-dessus, pas la courbe de trafic ci-dessous.",
  dataBehind: "DONNÉES À L'ORIGINE DE CETTE SYNTHÈSE",
  templateSummaryNote: "(Synthèse rédigée à partir d'un modèle : aucun fournisseur IA configuré.)",

  performanceOverTime: "Évolution dans le temps",
  sinceBaseline: (date, days) => `Depuis le point de départ (${date}, il y a environ ${days} jours) :`,
  sinceSnapshot: (date) => `Depuis le dernier relevé (${date}) :`,
  rowHealthScore: "Score de santé",
  rowClicks: "Clics organiques (28 jours)",
  rowImpressions: "Impressions organiques (28 jours)",
  rowSessions: "Sessions GA4 (28 jours)",
  rowConversions: "Conversions GA4 (28 jours)",
  rowRevenue: "Chiffre d'affaires organique (28 jours, $)",
  rowTop10: "Mots-clés dans le top 10",
  rowBacklinks: "Backlinks (enregistrés)",
  rowGbp: "Fiche Google Business, % du guide",
  fromTo: (a, b) => `${a} à ${b}`,

  highlights: "Faits marquants",
  auditsCompleted: "Audits réalisés sur la période",
  tasksCompleted: "Tâches terminées",
  tasksOf: (done, total) => `${done} sur ${total}`,
  openIssues: "Problèmes ouverts au dernier audit",
  organicSessions28: "Sessions organiques (28 jours)",
  vsPrior: (pct) => ` (${pct} par rapport à la période précédente)`,
  techStack: "Technologies",
  notDetected: "Non détectées",

  trafficTitle: "Trafic organique - 28 derniers jours",
  sessions: "Sessions",
  users: "Utilisateurs",
  pageviews: "Pages vues",
  weekOverWeek: "Évolution sur une semaine",
  googleUpdates: (labels, more) =>
    `Les pointillés marquent les mises à jour de Google : ${labels}${more > 0 ? ` (+${more} autres)` : ""}`,

  topKeywordsGsc: "Principaux mots-clés (Search Console, 28 jours)",
  topKeywords: "Principaux mots-clés organiques",
  clicksPos: (clicks, pos) => `${clicks} clics, position ${pos}`,
  colQuery: "REQUÊTE",
  colClicks: "CLICS",
  colImpr: "IMPR.",
  colCtr: "CTR",
  colPos: "POS.",
  quickWins: "Gains rapides - mots-clés en positions 4 à 15",
  quickWinsHint:
    "Juste en dehors de la première page, avec de vraies impressions. Un ajustement peut les y faire entrer, là où le taux de clic passe de moins de 2 % à 5-12 %.",

  issuesBySeverity: "Problèmes par gravité",
  severity: { critical: "CRITIQUE", high: "ÉLEVÉE", medium: "MOYENNE", low: "FAIBLE" },
  more: (n) => `+ ${n} autres`,
  onPages: (n) => (n === 1 ? "1 page" : `${n} pages`),
  morePages: (n) => (n === 1 ? "+ 1 autre page" : `+ ${n} autres pages`),
  moreRules: (n) => (n === 1 ? "+ 1 autre type de problème" : `+ ${n} autres types de problèmes`),
  foundByTools: "Trouvé par les outils",
  foundByToolsHint:
    "Des vérifications qui tournent seules entre les audits et regardent ce qu'un simple crawl ne voit pas.",
  foundBy: (tool) => `trouvé par ${tool}`,

  workCompleted: "Travail réalisé sur la période",
  noTasksDone: "Aucune tâche terminée sur cette période.",
  linksLost: "Liens perdus sur la période",
  linksLostCount: (n) => `${n} ${plural(n, "lien introuvable", "liens introuvables")}`,
  linksLostHint:
    "Chaque page source a été vérifiée deux fois sans trouver le lien. Ce sont souvent les liens les moins coûteux à récupérer : l'éditeur a déjà jugé une fois que le site méritait un lien.",
  anchor: (a) => `ancre : « ${a} »`,
  lastSeen: (d) => `vu pour la dernière fois le ${d}`,
  linksBuilt: "Liens obtenus sur la période",
  linksPlaced: (n) => `${n} ${plural(n, "lien placé", "liens placés")}`,
  dofollowAvg: (n, avg) => `${n} dofollow${avg !== null ? `, DA moyen ${avg}` : ""}`,
  hubLive: "Suivi des backlinks - liens en ligne",
  hubCount: (n) => `${n} ${plural(n, "lien", "liens")} issus de votre suivi`,
  unknown: "(inconnu)",
  guestPosts: "Articles invités publiés",
  guestCount: (n) => `${n} ${plural(n, "article invité en ligne", "articles invités en ligne")}`,
  target: (k) => `cible : ${k}`,
  rankMovement: "Évolution des positions",
  rankSummary: (up, down) => `${up} ${plural(up, "mot-clé en hausse", "mots-clés en hausse")}, ${down} en baisse`,
  rankRow: (prior, current, delta) => `  n°${prior ?? "-"} à n°${current ?? "-"} (${delta})`,
  rankRowOut: (prior, absent) => `  n°${prior} à ${absent}`,
  rankRowIn: (absent, current) => `  ${absent} à n°${current}`,
  rankAbsent: {
    gsc: "aucune impression dans Search Console",
    first: (count, engine) =>
      count === 1 ? `absent du premier résultat (${engine})` : `absent des ${count} premiers résultats (${engine})`,
    read: (engine) => `absent des résultats lus (${engine})`,
    engines: {
      searxng: "SearXNG",
      brave: "Brave Search",
      duckduckgo: "DuckDuckGo",
      google: "Google",
      unknown: "moteur non enregistré",
    },
  },
  pageChanges: "Changements détectés sur les pages",
  fieldChanged: (field, critical) => `${critical ? "Critique : " : ""}${field} modifié`,
  changedOn: (url, date) => `  sur ${url}, le ${date}`,
  unknownUrl: "(adresse inconnue)",
  aiApplied: "Suggestions IA appliquées",
  aiAppliedCount: (n) => `${n} ${plural(n, "suggestion appliquée", "suggestions appliquées")} sur la période.`,

  recommendations: "Recommandations pour la prochaine période",
  noRecommendations: "Aucune recommandation ouverte. Lancez un nouvel audit pour en obtenir de nouvelles.",
  priority: { high: "PRIORITÉ HAUTE", medium: "PRIORITÉ MOYENNE", low: "PRIORITÉ BASSE" },
  covers: "Ce que couvre ce rapport",
  coversTechnical:
    "Modèle technique : tous les problèmes de toutes les pages explorées, avec les adresses concernées. À utiliser pour une passation à l'équipe technique ou pour vérifier avant et après une mise en production.",

  footerBrand: (name, when) => `Préparé par ${name}, le ${when}`,
  footerLocal: (when) => `Généré le ${when}, instance auto-hébergée`,

  summary: {
    steady: (c, s) => `Le score de santé de ${c} reste stable à ${s}/100 sur cette période.`,
    up: (c, d, s) => `Le score de santé de ${c} progresse de ${d} points sur cette période, à ${s}/100.`,
    down: (c, d, s) => `Le score de santé de ${c} recule de ${d} points sur cette période, à ${s}/100.`,
    baseline: (c, s) => `${c} a désormais un score de santé de référence de ${s}/100, sa première mesure.`,
    none: (c) => `${c} n'a pas encore d'audit terminé.`,
    closed: (d, t) => `Nous avons terminé ${d} des ${t} tâches SEO.`,
    queued: (t) => `${t} ${plural(t, "tâche SEO est", "tâches SEO sont")} en attente, aucune terminée pour l'instant.`,
    next: (issue) => `Prochaine priorité : ${issue}.`,
    dpHealth: "Score de santé",
    dpHealthDelta: (s, d, prev) => `${s} / 100 (${d} depuis le dernier audit, contre ${prev})`,
    dpHealthFirst: (s) => `${s} / 100 (première mesure)`,
    dpTasks: "Tâches",
    dpTasksValue: (done, open, total) => `${done} terminées / ${open} ouvertes / ${total} au total`,
    dpTopIssue: (sev) => `Problème principal (${sev})`,
    dpOtherIssues: "Autres problèmes relevés",
    dpOtherIssuesValue: (n, list) => `${n} de plus (${list})`,
    dpSessions: "Sessions organiques (28 derniers jours)",
    dpSessionsTrend: (pct) => ` (${pct} par rapport aux 28 jours précédents)`,
    dpTopQuery: "Requête organique principale",
    dpTopQueryValue: (q, clicks, pos) => `« ${q} » : ${clicks} clics en position ${pos}`,
    dpQuickWins: "Mots-clés à gain rapide (positions 4 à 15)",
    dpTech: "Technologies détectées",
    dpNiche: "Secteur",
    severity: { critical: "critique", high: "élevée", medium: "moyenne", low: "faible" },
    aiLanguage: "Rédige la synthèse en français.",
  },
};

const STRINGS: Record<Locale, ReportStrings> = { en, fr };

export function reportStrings(locale: Locale): ReportStrings {
  return STRINGS[locale];
}

/** The workspace language (Settings → General), the one reports use. */
export async function getReportLocale(): Promise<Locale> {
  try {
    const stored = await getSetting<string>("ui.locale");
    if (isLocale(stored)) return stored;
  } catch {
    // DB unavailable: fall through to the default
  }
  return defaultLocale;
}

/**
 * Number and date formatting that PDFKit's Helvetica can draw: French
 * uses U+202F (narrow no-break space) as the thousands separator, which
 * WinAnsi does not have; U+00A0 looks the same and is in the font.
 */
const winAnsi = (s: string) => s.replace(/ /g, " ");

export function reportFormat(locale: Locale) {
  const tag = STRINGS[locale].intlLocale;
  return {
    num: (n: number) => winAnsi(n.toLocaleString(tag)),
    dec: (n: number, digits = 1) =>
      winAnsi(n.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits })),
    date: (d: Date) => winAnsi(d.toLocaleDateString(tag)),
    dateTime: (d: Date) =>
      winAnsi(d.toLocaleString(tag, { dateStyle: "short", timeStyle: "short" })),
    monthYear: (d: Date) => {
      const s = d.toLocaleDateString(tag, { month: "long", year: "numeric" });
      return winAnsi(s.charAt(0).toUpperCase() + s.slice(1));
    },
    /** "+3", "-2", "0": signed delta, ASCII minus (WinAnsi has no U+2212). */
    signed: (n: number) => (n > 0 ? `+${n}` : String(n)),
    pct: (n: number) => winAnsi(`${n > 0 ? "+" : ""}${n}${locale === "fr" ? " %" : "%"}`),
  };
}
