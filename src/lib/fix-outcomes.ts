/**
 * Les changements de l'agent ont-ils servi à quelque chose ?
 *
 * Porté depuis l'auteur (upstream eb10f33). Compare, pour chaque page
 * modifiée et confirmée, les chiffres Search Console des 28 jours AVANT
 * le changement et des 28 jours APRÈS.
 *
 * Adaptation du fork : ce module ne produit AUCUNE phrase. Il renvoie des
 * données structurées (confiance, écarts, nombre de jours) et l'écran les
 * met en mots via next-intl, en français puis en anglais. Les règles de
 * prudence restent ici, testées sans base ni API :
 *
 *  1. 28 jours COMPLETS après le changement avant toute mesure, en tenant
 *     compte du délai de 2 jours de Google (les jours récents ne sont pas
 *     encore comptés complètement).
 *  2. Jamais de causalité : c'est une mesure, pas une preuve (la mention
 *     est portée par les traductions, vérifiée par les tests).
 *  3. Pas de pourcentage sur presque rien : sous 100 impressions de chaque
 *     côté, la page est « trop peu de trafic pour conclure ».
 *  4. Les baisses aussi visibles que les hausses (triées en premier).
 */

export type FixWindow = {
  /** Identifiant de l'action, pour pouvoir y renvoyer. */
  actionId: number;
  url: string;
  kind: string;
  appliedAt: Date;
};

export type PeriodMetrics = {
  clicks: number;
  impressions: number;
  /** Position moyenne ; plus petit = mieux. 0 quand inconnue. */
  position: number;
};

/**
 * Sens d'une évolution, sans phrase.
 * - `up` / `down` : variation relative (`ratio`, ex. 0,4 pour 40 %)
 * - `flat`        : variation arrondie à 0 %
 * - `from_zero`   : avant = 0, après > 0 (aucun pourcentage possible)
 * - `zero`        : 0 avant, 0 après
 */
export type Change =
  | { direction: "up" | "down"; ratio: number }
  | { direction: "flat" | "from_zero" | "zero" };

export type FixOutcome = {
  actionId: number;
  url: string;
  kind: string;
  appliedAt: Date;
  before: PeriodMetrics;
  after: PeriodMetrics;
  clicksDelta: number;
  impressionsDelta: number;
  /** Négatif = la page est remontée (position plus petite). 0 si inconnu. */
  positionDelta: number;
  /**
   * Ce que les chiffres peuvent supporter.
   * - `measured`  : assez de volume pour que le sens veuille dire quelque chose
   * - `thin`      : données réelles, trop peu pour en tirer un pourcentage
   * - `too_early` : moins de 28 jours complets depuis le changement
   */
  confidence: "measured" | "thin" | "too_early";
  clicksChange: Change;
  impressionsChange: Change;
  /** Jours écoulés depuis le changement (0 = aujourd'hui). */
  daysAgo: number;
  /** Jours restants avant de pouvoir mesurer ; 0 quand c'est déjà possible. */
  daysToGo: number;
};

/** Jours de données nécessaires de chaque côté. */
export const WINDOW_DAYS = 28;

/**
 * Impressions sous lesquelles un pourcentage ne veut rien dire (des deux
 * côtés). 100 sur 28 jours, c'est 3 à 4 par jour : en dessous, quelques
 * impressions de plus font un pourcentage à deux chiffres qui n'est que du
 * bruit.
 */
export const THIN_IMPRESSIONS = 100;

/** Search Console ne publie pas les deux derniers jours de façon fiable. */
export const REPORTING_LAG_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

/**
 * Les deux périodes à comparer pour un changement appliqué à `appliedAt`,
 * ou null s'il est trop tôt pour regarder.
 *
 * Le jour même du changement est exclu des deux côtés : il contient des
 * heures des deux états et fausserait celui où on le compterait.
 */
export function windowsFor(
  appliedAt: Date,
  now: Date = new Date(),
): {
  before: { start: string; end: string };
  after: { start: string; end: string };
} | null {
  // Le dernier jour fiable dans Search Console.
  const usableEnd = addDays(now, -REPORTING_LAG_DAYS);

  const afterStart = addDays(appliedAt, 1);
  const afterEnd = addDays(afterStart, WINDOW_DAYS - 1);

  if (afterEnd > usableEnd) return null;

  const beforeEnd = addDays(appliedAt, -1);
  const beforeStart = addDays(beforeEnd, -(WINDOW_DAYS - 1));

  return {
    before: { start: ymd(beforeStart), end: ymd(beforeEnd) },
    after: { start: ymd(afterStart), end: ymd(afterEnd) },
  };
}

/** Jours avant qu'un changement devienne mesurable ; 0 s'il l'est déjà. */
export function daysUntilMeasurable(
  appliedAt: Date,
  now: Date = new Date(),
): number {
  if (windowsFor(appliedAt, now)) return 0;
  const usableEnd = addDays(now, -REPORTING_LAG_DAYS);
  const afterEnd = addDays(appliedAt, WINDOW_DAYS);
  const ms = afterEnd.getTime() - usableEnd.getTime();
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

/** Sens et ampleur d'une évolution, arrondie au pour cent. */
export function changeBetween(before: number, after: number): Change {
  if (before === 0) return { direction: after > 0 ? "from_zero" : "zero" };
  const pct = Math.round(((after - before) / before) * 100);
  if (pct === 0) return { direction: "flat" };
  return { direction: pct > 0 ? "up" : "down", ratio: Math.abs(pct) / 100 };
}

function daysBetween(d: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / DAY_MS));
}

/**
 * Le résultat d'un changement à partir des chiffres des deux périodes.
 * Pur : seuils et règles testables sans Search Console.
 */
export function outcomeFor(
  fix: FixWindow,
  before: PeriodMetrics | null,
  after: PeriodMetrics | null,
  now: Date = new Date(),
): FixOutcome {
  const zero: PeriodMetrics = { clicks: 0, impressions: 0, position: 0 };
  const b = before ?? zero;
  const a = after ?? zero;

  const tooEarly = !windowsFor(fix.appliedAt, now);
  const thin =
    !tooEarly &&
    b.impressions < THIN_IMPRESSIONS &&
    a.impressions < THIN_IMPRESSIONS;

  return {
    actionId: fix.actionId,
    url: fix.url,
    kind: fix.kind,
    appliedAt: fix.appliedAt,
    before: b,
    after: a,
    clicksDelta: a.clicks - b.clicks,
    impressionsDelta: a.impressions - b.impressions,
    // Les deux positions doivent être réelles : 0 veut dire « non
    // communiquée », pas « première place ». La soustraire inventerait une
    // remontée de 40 places à partir d'une donnée absente.
    positionDelta:
      b.position > 0 && a.position > 0 ? a.position - b.position : 0,
    confidence: tooEarly ? "too_early" : thin ? "thin" : "measured",
    clicksChange: changeBetween(b.clicks, a.clicks),
    impressionsChange: changeBetween(b.impressions, a.impressions),
    daysAgo: daysBetween(fix.appliedAt, now),
    daysToGo: tooEarly ? daysUntilMeasurable(fix.appliedAt, now) : 0,
  };
}

export type OutcomeRollup = {
  /** Nombre total de changements considérés. */
  total: number;
  measured: number;
  thin: number;
  tooEarly: number;
  /** Pages mesurées dont les clics ont augmenté. */
  improved: number;
  /** Pages mesurées dont les clics ont baissé — affichées autant que les hausses. */
  declined: number;
  flat: number;
  clicksDelta: number;
  impressionsDelta: number;
  /**
   * Quelle phrase de synthèse utiliser :
   * - `empty`           : rien d'appliqué et confirmé
   * - `none_measurable` : des changements, aucun encore mesurable (jamais « 0 clic net »)
   * - `measured`        : au moins un changement mesuré
   */
  state: "empty" | "none_measurable" | "measured";
};

/**
 * Totaux sur les changements mesurés uniquement. Les pages « trop tôt » ou
 * « trop peu de trafic » ne comptent pas dans les écarts : quelques lignes
 * bruitées feraient sinon basculer le chiffre de tête.
 */
export function rollupOutcomes(outcomes: FixOutcome[]): OutcomeRollup {
  const measured = outcomes.filter((o) => o.confidence === "measured");
  const improved = measured.filter((o) => o.clicksDelta > 0).length;
  const declined = measured.filter((o) => o.clicksDelta < 0).length;

  return {
    total: outcomes.length,
    measured: measured.length,
    thin: outcomes.filter((o) => o.confidence === "thin").length,
    tooEarly: outcomes.filter((o) => o.confidence === "too_early").length,
    improved,
    declined,
    flat: measured.length - improved - declined,
    clicksDelta: measured.reduce((n, o) => n + o.clicksDelta, 0),
    impressionsDelta: measured.reduce((n, o) => n + o.impressionsDelta, 0),
    state:
      outcomes.length === 0
        ? "empty"
        : measured.length === 0
          ? "none_measurable"
          : "measured",
  };
}

/**
 * Ordre d'affichage : les mesurés d'abord, la pire baisse en tête, puis
 * les « trop peu de trafic », puis les « trop tôt ». Une baisse ne doit
 * jamais se retrouver en bas de liste.
 */
export function sortOutcomes(outcomes: FixOutcome[]): FixOutcome[] {
  const rank = (o: FixOutcome) =>
    o.confidence === "measured" ? 0 : o.confidence === "thin" ? 1 : 2;
  return [...outcomes].sort((a, b) => {
    const r = rank(a) - rank(b);
    return r !== 0 ? r : a.clicksDelta - b.clicksDelta;
  });
}
