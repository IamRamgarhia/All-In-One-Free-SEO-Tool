/**
 * Mesurer ce qu'ont donné les changements de l'agent (porté depuis
 * l'auteur, eb10f33). Presque chaque test porte sur un refus :
 *
 *   1. ne pas lire un résultat avant 28 jours complets « après »
 *   2. ne pas présenter une mesure comme une cause
 *   3. ne pas transformer 3 → 6 impressions en « +100 % »
 *   4. ne pas mettre les hausses plus en avant que les baisses
 *
 * Le module est pur et ne produit pas de phrases : les règles de wording
 * (mention « mesuré, pas attribué ») sont vérifiées sur les traductions
 * françaises et anglaises, là où elles vivent dans le fork.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import {
  THIN_IMPRESSIONS,
  WINDOW_DAYS,
  changeBetween,
  daysUntilMeasurable,
  outcomeFor,
  rollupOutcomes,
  sortOutcomes,
  windowsFor,
  type FixWindow,
  type PeriodMetrics,
} from "./fix-outcomes";

const NOW = new Date("2026-11-19T12:00:00Z");

const fix = (appliedAt: string, actionId = 1): FixWindow => ({
  actionId,
  url: "https://example.com/page",
  kind: "write_title",
  appliedAt: new Date(appliedAt),
});

const m = (clicks: number, impressions: number, position = 0): PeriodMetrics => ({
  clicks,
  impressions,
  position,
});

describe("refuse de lire un résultat trop tôt", () => {
  it("un changement d'hier n'a pas de périodes", () => {
    expect(windowsFor(new Date("2026-11-18T00:00:00Z"), NOW)).toBeNull();
  });

  it("un changement d'il y a 20 jours n'en a toujours pas", () => {
    expect(windowsFor(new Date("2026-10-30T00:00:00Z"), NOW)).toBeNull();
  });

  it("un changement d'il y a 40 jours en a", () => {
    const w = windowsFor(new Date("2026-10-10T00:00:00Z"), NOW);
    expect(w).toBeTruthy();
    expect(w!.after.start).toBe("2026-10-11");
    expect(w!.after.end).toBe("2026-11-07");
  });

  it("le jour du changement est exclu des deux côtés", () => {
    const w = windowsFor(new Date("2026-10-10T00:00:00Z"), NOW)!;
    expect(w.before.end).toBe("2026-10-09");
    expect(w.after.start).toBe("2026-10-11");
  });

  it("les deux périodes ont la même longueur", () => {
    const w = windowsFor(new Date("2026-10-01T00:00:00Z"), NOW)!;
    const days = (a: string, b: string) =>
      (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
    expect(days(w.before.start, w.before.end)).toBe(WINDOW_DAYS);
    expect(days(w.after.start, w.after.end)).toBe(WINDOW_DAYS);
  });

  it("respecte le délai de 2 jours de Search Console, pile à la limite", () => {
    // NOW = 19 nov : dernier jour fiable le 17. Un changement du 20 oct a
    // une période « après » du 21 oct au 17 nov : mesurable. Un jour plus
    // tard, non.
    const onBoundary = windowsFor(new Date("2026-10-20T00:00:00Z"), NOW);
    expect(onBoundary).toBeTruthy();
    expect(onBoundary!.after.end).toBe("2026-11-17");
    expect(windowsFor(new Date("2026-10-21T00:00:00Z"), NOW)).toBeNull();
  });

  it("indique combien de jours attendre", () => {
    expect(daysUntilMeasurable(new Date("2026-11-18T00:00:00Z"), NOW)).toBeGreaterThan(25);
    expect(daysUntilMeasurable(new Date("2026-09-01T00:00:00Z"), NOW)).toBe(0);
  });

  it("trop tôt : confiance too_early et attente renseignée, même avec des chiffres", () => {
    const o = outcomeFor(fix("2026-11-15T00:00:00Z"), m(10, 500), m(14, 700), NOW);
    expect(o.confidence).toBe("too_early");
    expect(o.daysToGo).toBeGreaterThan(0);
    expect(o.daysAgo).toBe(4);
  });
});

describe("refuse un pourcentage sur presque rien", () => {
  it("3 → 6 impressions est « trop peu », pas +100 %", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(0, 3), m(0, 6), NOW);
    expect(o.confidence).toBe("thin");
  });

  it("le seuil s'applique des deux côtés", () => {
    const below = THIN_IMPRESSIONS - 1;
    expect(outcomeFor(fix("2026-09-01T00:00:00Z"), m(0, below), m(0, below), NOW).confidence).toBe("thin");
  });

  it("une page passée au-dessus du seuil après le changement EST mesurée", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(1, 20), m(30, 900), NOW);
    expect(o.confidence).toBe("measured");
  });

  it("une page sans aucune donnée ne plante pas", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), null, null, NOW);
    expect(o.before.clicks).toBe(0);
    expect(o.confidence).toBe("thin");
  });
});

describe("évolutions et positions", () => {
  it("calcule hausse, baisse, stable, depuis zéro", () => {
    expect(changeBetween(100, 140)).toEqual({ direction: "up", ratio: 0.4 });
    expect(changeBetween(200, 120)).toEqual({ direction: "down", ratio: 0.4 });
    expect(changeBetween(1000, 1001)).toEqual({ direction: "flat" });
    expect(changeBetween(0, 5)).toEqual({ direction: "from_zero" });
    expect(changeBetween(0, 0)).toEqual({ direction: "zero" });
  });

  it("une baisse est rapportée telle quelle", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(200, 9000), m(120, 8000), NOW);
    expect(o.clicksDelta).toBe(-80);
    expect(o.clicksChange).toEqual({ direction: "down", ratio: 0.4 });
  });

  it("une position 0 veut dire inconnue, pas première place", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(10, 500, 0), m(12, 600, 8.2), NOW);
    expect(o.positionDelta).toBe(0);
  });

  it("une position plus petite est une amélioration (écart négatif)", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(10, 500, 14), m(20, 700, 8), NOW);
    expect(o.positionDelta).toBe(-6);
  });
});

describe("la synthèse est honnête sur ce qu'elle totalise", () => {
  const old = "2026-09-01T00:00:00Z";

  it("seuls les changements mesurés comptent dans les écarts", () => {
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix("2026-11-18T00:00:00Z"), m(10, 900), m(900, 90000), NOW),
      outcomeFor(fix(old), m(1, 5), m(1, 9), NOW),
    ]);
    expect(r.measured).toBe(1);
    expect(r.tooEarly).toBe(1);
    expect(r.thin).toBe(1);
    expect(r.clicksDelta).toBe(50);
    expect(r.state).toBe("measured");
  });

  it("compte séparément hausses et baisses", () => {
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix(old), m(100, 5000), m(40, 4000), NOW),
    ]);
    expect(r.improved).toBe(1);
    expect(r.declined).toBe(1);
  });

  it("« rien de mesurable » n'est pas « zéro effet »", () => {
    const r = rollupOutcomes([
      outcomeFor(fix("2026-11-18T00:00:00Z"), m(10, 900), m(11, 950), NOW),
    ]);
    expect(r.measured).toBe(0);
    expect(r.state).toBe("none_measurable");
  });

  it("rien d'appliqué : état vide", () => {
    expect(rollupOutcomes([]).state).toBe("empty");
  });

  it("les baisses passent avant les hausses, les non-mesurés après", () => {
    const sorted = sortOutcomes([
      outcomeFor(fix("2026-11-18T00:00:00Z", 1), null, null, NOW),
      outcomeFor(fix(old, 2), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix(old, 3), m(1, 5), m(1, 9), NOW),
      outcomeFor(fix(old, 4), m(100, 5000), m(40, 4000), NOW),
    ]);
    expect(sorted.map((o) => o.actionId)).toEqual([4, 2, 3, 1]);
  });
});

describe("les textes affichés ne revendiquent jamais de causalité", () => {
  const load = (locale: "fr" | "en") =>
    JSON.parse(
      readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
    ) as Record<string, unknown>;

  for (const locale of ["fr", "en"] as const) {
    const t = createTranslator({
      locale,
      messages: load(locale) as never,
      namespace: "ui.app_agent_autopilot_outcomes" as never,
    }) as unknown as (key: string, values?: Record<string, unknown>) => string;

    const measured = t("rowMeasured", {
      window: 28,
      clicks: "x",
      clicksBefore: "100",
      clicksAfter: "140",
      impressions: "y",
      imprBefore: "5000",
      imprAfter: "6000",
      position: "",
    });
    const rollup = t("rollupMeasured", {
      measured: 1,
      window: 28,
      improved: 1,
      declined: 0,
      flat: 0,
      clicks: "+50",
      impressions: "+1000",
    });

    it(`${locale} : chaque ligne mesurée porte la mention « mesuré, pas attribué »`, () => {
      expect(measured.toLowerCase()).toMatch(
        locale === "fr" ? /mesuré, pas attribué/ : /measured, not attributed/,
      );
      expect(measured).toContain("100 → 140");
    });

    it(`${locale} : la synthèse répète la mise en garde`, () => {
      expect(rollup.toLowerCase()).toMatch(
        locale === "fr" ? /pas des attributions/ : /not attributions/,
      );
    });

    it(`${locale} : aucun mot de causalité`, () => {
      const all = [measured, rollup, t("intro", { window: 28, lag: 2 })]
        .join(" ")
        .toLowerCase();
      expect(all).not.toMatch(/caus|grâce à|thanks to/);
    });

    it(`${locale} : « rien de mesurable » omet les parties à zéro`, () => {
      const s = t("rollupNoneMeasurable", { total: 3, tooEarly: 3, thin: 0, both: "no", window: 28 });
      expect(s).not.toMatch(/\b0 /);
      expect(s).toMatch(/ 3 /);
      const r = t("rollupRemainder", { tooEarly: 0, thin: 2, both: "no" });
      expect(r).not.toMatch(/\b0 /);
      expect(r).not.toMatch(/ (et|and) /);
    });

    it(`${locale} : « trop peu de trafic » dit que le changement peut être bon`, () => {
      const thin = t("rowThin", { before: "3", after: "6" });
      expect(thin).not.toMatch(/%/);
      expect(thin.toLowerCase()).toMatch(
        locale === "fr" ? /peut tout de même être le bon/ : /may still be right/,
      );
    });

    it(`${locale} : « indisponible » nomme Search Console sans dire « aucun effet »`, () => {
      for (const key of ["unavailableNoProperty", "unavailableGsc"]) {
        const s = t(key, { count: 2 });
        expect(s).toMatch(/Search Console/);
        expect(s.toLowerCase()).not.toMatch(/no effect|did nothing|aucun effet|rien donné/);
      }
    });
  }

  it("fr : espace insécable avant les deux-points, point-virgule et point d'interrogation", () => {
    const fr = load("fr") as { ui: Record<string, Record<string, string>> };
    for (const s of Object.values(fr.ui.app_agent_autopilot_outcomes)) {
      expect(s).not.toMatch(/ [:;?!]/);
      expect(s).not.toMatch(/[^  ][;?!]/);
    }
  });
});
