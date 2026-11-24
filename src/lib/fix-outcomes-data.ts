/**
 * Charge les données sur lesquelles raisonne fix-outcomes.ts (base +
 * Search Console). Séparé pour que les règles restent pures et testées.
 *
 * Porté depuis l'auteur (upstream eb10f33), adapté au fork :
 * - jetons OAuth propres au projet quand il y en a (`clientIdScope`) ;
 * - `unavailable` est un code, pas une phrase : l'écran le traduit ;
 * - une propriété qui ne renvoie AUCUNE ligne sur les deux périodes est
 *   traitée comme « illisible », pas comme « aucun trafic » ;
 * - les changements dont la période n'a pas pu être lue sont comptés
 *   (`notRead`) au lieu de disparaître en silence.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { agentActions, clients } from "@/db/schema";
import {
  outcomeFor,
  rollupOutcomes,
  sortOutcomes,
  windowsFor,
  type FixOutcome,
  type FixWindow,
  type OutcomeRollup,
  type PeriodMetrics,
} from "./fix-outcomes";

export type OutcomeUnavailable = {
  /**
   * - `no_property` : aucune propriété Search Console reliée au projet
   * - `gsc_failed`  : Search Console n'a pas répondu (ou rien renvoyé)
   */
  reason: "no_property" | "gsc_failed";
  /** Nombre de changements appliqués qui ne peuvent pas être mesurés. */
  count: number;
};

export type OutcomeReport = {
  outcomes: FixOutcome[];
  rollup: OutcomeRollup;
  /**
   * Pourquoi il n'y a rien à montrer, quand il n'y a rien à montrer.
   * « Vos changements n'ont rien donné » et « nous ne voyons pas votre
   * Search Console » ne doivent jamais s'afficher pareil.
   */
  unavailable: OutcomeUnavailable | null;
  /** Changements dont la période n'a pas pu être lue (réponse partielle). */
  notRead: number;
};

/** Plafond de lignes d'une réponse Search Console. */
const GSC_ROW_LIMIT = 25_000;

/** Mesure chaque changement confirmé d'un projet. */
export async function measureFixOutcomes(
  clientId: number,
  now: Date = new Date(),
): Promise<OutcomeReport> {
  const [client] = await db
    .select({ gscProperty: clients.gscProperty })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  const actions = await db
    .select({
      id: agentActions.id,
      kind: agentActions.kind,
      targetUrl: agentActions.targetUrl,
      appliedAt: agentActions.appliedAt,
    })
    .from(agentActions)
    .where(
      and(
        eq(agentActions.clientId, clientId),
        inArray(agentActions.status, ["applied", "verified"]),
        isNotNull(agentActions.appliedAt),
        isNotNull(agentActions.targetUrl),
      ),
    );

  const fixes: FixWindow[] = actions
    .filter((a) => a.appliedAt && a.targetUrl)
    .map((a) => ({
      actionId: a.id,
      url: a.targetUrl!,
      kind: a.kind,
      appliedAt: a.appliedAt!,
    }));

  const empty = (unavailable: OutcomeUnavailable | null): OutcomeReport => ({
    outcomes: [],
    rollup: rollupOutcomes([]),
    unavailable,
    notRead: 0,
  });

  if (fixes.length === 0) return empty(null);

  const property = client?.gscProperty;
  if (!property) {
    return empty({ reason: "no_property", count: fixes.length });
  }

  // Regroupés par JOUR d'application : les changements d'un même jour
  // partagent les mêmes périodes, donc une seule paire d'appels API pour
  // tous (sinon deux appels par changement, contre un quota).
  const byDay = new Map<string, FixWindow[]>();
  for (const f of fixes) {
    const key = f.appliedAt.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(f);
    byDay.set(key, list);
  }

  const outcomes: FixOutcome[] = [];
  let notRead = 0;

  for (const [, group] of byDay) {
    const windows = windowsFor(group[0].appliedAt, now);
    if (!windows) {
      // Trop tôt : aucun appel, la réponse ne dépend pas des données.
      for (const f of group) outcomes.push(outcomeFor(f, null, null, now));
      continue;
    }

    const [before, after] = await Promise.all([
      pagesInWindow(property, windows.before, clientId),
      pagesInWindow(property, windows.after, clientId),
    ]);

    // Aucune ligne sur les deux périodes pour toute la propriété : c'est
    // une propriété qu'on ne lit pas (mauvaise propriété, pas de données),
    // pas « un site sans aucun trafic ». On ne l'affiche pas comme un zéro.
    if (
      before === null ||
      after === null ||
      (before.size === 0 && after.size === 0)
    ) {
      notRead += group.length;
      continue;
    }

    for (const f of group) {
      outcomes.push(
        outcomeFor(
          f,
          before.get(norm(f.url)) ?? null,
          after.get(norm(f.url)) ?? null,
          now,
        ),
      );
    }
  }

  if (outcomes.length === 0 && notRead > 0) {
    return empty({ reason: "gsc_failed", count: notRead });
  }

  const sorted = sortOutcomes(outcomes);
  return {
    outcomes: sorted,
    rollup: rollupOutcomes(sorted),
    unavailable: null,
    notRead,
  };
}

/** Normalise une URL pour rapprocher la cible de l'agent et la clé Search Console. */
export function norm(u: string): string {
  return u
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/**
 * Chiffres par page sur une période, ou null quand l'API a refusé.
 * Null (« on n'a pas pu demander ») et vide sont deux réponses distinctes.
 */
async function pagesInWindow(
  siteUrl: string,
  window: { start: string; end: string },
  clientId: number,
): Promise<Map<string, PeriodMetrics> | null> {
  try {
    const { fetchGscPerformance } = await import("./google-oauth");
    const rows = await fetchGscPerformance({
      siteUrl,
      startDate: window.start,
      endDate: window.end,
      dimensions: ["page"],
      rowLimit: GSC_ROW_LIMIT,
      dataState: "final",
      clientIdScope: clientId,
    });
    const out = new Map<string, PeriodMetrics>();
    for (const r of rows) {
      const page = r.keys[0];
      if (!page) continue;
      out.set(norm(page), {
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      });
    }
    return out;
  } catch {
    return null;
  }
}
