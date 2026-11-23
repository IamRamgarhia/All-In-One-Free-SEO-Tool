/**
 * Render a proposal to PDF.
 *
 * Deliberately plain. A proposal competes with a Word document someone
 * spent an evening on, and the way to win that is to look considered,
 * not to look generated — so no gradient hero, no score gauge, no
 * dashboard chrome. Cover, what we found, what we'd do, what it costs,
 * terms.
 *
 * The one thing this document asserts beyond the user's own words is the
 * finding count per scope line, and that number is real: it comes from
 * the audit the proposal cites, on the date it cites.
 */

import PDFDocument from "pdfkit";
import { registerInterFonts, pickFont } from "./report-fonts";
import { accentColor, isWhiteLabelled, loadBrand, type Brand } from "./brand";
import { SEVERITIES, type ScopeLine, type Severity } from "./proposal-scope";
import {
  billableHours,
  bySeverity,
  formatDuration,
  lineMinutes,
  totals,
  workload,
  type PriceLine,
  type QuoteSettings,
} from "./quote";
import type { OfferSnapshot } from "./service-offers";
import type { Proposal } from "@/db/schema";
import { splitSurfaces, surfacesFor } from "./engagement-surfaces";

export type ProposalDoc = {
  prospectName: string;
  prospectUrl: string | null;
  title: string;
  intro: string | null;
  scope: ScopeLine[];
  pricing: PriceLine[];
  /** Catalogue services the quote sells, as frozen on the proposal. */
  offers?: OfferSnapshot[] | null;
  /** Hourly rate and covered severities. Absent on older documents. */
  quote?: QuoteSettings | null;
  /** "fr" or "en". Everything the document says itself follows it. */
  locale?: string;
  currency: string;
  terms: string | null;
  basedOnScore: number | null;
  basedOnAt: Date | null;
  /**
   * Where the site ranks today, before any work. Optional, and only
   * populated for a kickoff document — a client signing off on a plan
   * needs the starting line written down, or there is nothing to measure
   * the next report against.
   *
   * Counts are computed from tracked keywords and their latest checked
   * rank. Nothing here is model-written.
   */
  keywordBaseline?: {
    tracked: number;
    /** Keywords whose position was checked at least once (absent on older documents). */
    checked?: number;
    ranking: number;
    inTopTen: number;
    strikingDistance: number;
    /** A few real examples, so the number is checkable. */
    examples: { keyword: string; position: number | null }[];
    /**
     * The list itself. Optional — documents built before this existed
     * carry counts and no list, and those must keep rendering.
     */
    map?: {
      keyword: string;
      intent: string;
      position: number | null;
      targetPage: string | null;
    }[];
  } | null;
  /** Week-by-week plan the client is being asked to approve. */
  timeline?: {
    week: string;
    focus: string;
    items: string[];
    /** "Foundation · days 1-30" etc. Absent on older documents. */
    phase?: string;
  }[] | null;
  /**
   * Where we'll work — the engagement's boundary, in and out.
   *
   * The section every agency scope-of-work leads with, and the one this
   * document had no answer for: it told the client what we found and
   * when things happen, and never what places the work covers.
   */
  surfaces?: {
    inScope: { label: string; detail: string }[];
    outOfScope: { label: string }[];
  } | null;
};

/**
 * Every sentence the document writes itself, in both languages.
 *
 * The user's own words (title, intro, terms, service names) are printed
 * as typed; only the frame around them is translated.
 */
function labelsFor(locale: string) {
  const fr = locale === "fr";
  const date = (d: Date) =>
    d.toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return {
    locale: fr ? "fr-FR" : "en-GB",
    date,
    subject: (name: string) => (fr ? `Proposition SEO pour ${name}` : `SEO proposal for ${name}`),
    preparedFor: (name: string) => (fr ? `Préparé pour ${name}` : `Prepared for ${name}`),
    found: fr ? "Ce que nous avons trouvé" : "What we found",
    foundScore: (n: number) => (fr ? `un score de santé global de ${n} sur 100` : `an overall health score of ${n} out of 100`),
    foundIssues: (n: number) =>
      fr ? `${plural(n, "point", "points")} à corriger` : `${plural(n, "issue", "issues")} worth addressing`,
    foundSentence: (site: string, on: string | null, parts: string[]) =>
      fr
        ? `Nous avons réalisé un audit technique de ${site}${on ? ` le ${on}` : ""}. Il montre ${parts.join(" et ")}. Le travail ci-dessous répond à ce qu’il a trouvé : rien n’y figure que l’audit n’ait pas relevé.`
        : `We ran a technical audit of ${site}${on ? ` on ${on}` : ""}. It showed ${parts.join(" and ")}. The work below addresses what it found — nothing is included that the audit didn't surface.`,
    whereWork: fr ? "Notre périmètre" : "Where we'll work",
    notIncluded: (list: string) => (fr ? `Non inclus dans cette mission : ${list}.` : `Not included in this engagement: ${list}.`),
    scope: fr ? "Ce que nous ferons" : "What we'd do",
    findings: (n: number) => (fr ? plural(n, "erreur", "erreurs") : plural(n, "finding", "findings")),
    severityTitle: fr ? "Volume de travail par gravité" : "Workload by severity",
    severityHead: fr ? ["GRAVITÉ", "ERREURS", "TEMPS", ""] : ["SEVERITY", "ERRORS", "TIME", ""],
    severity: (s: Severity) =>
      ({
        critical: fr ? "Critique" : "Critical",
        high: fr ? "Haute" : "High",
        medium: fr ? "Moyenne" : "Medium",
        low: fr ? "Basse" : "Low",
      })[s],
    inQuote: fr ? "inclus" : "included",
    asOption: fr ? "en option" : "optional",
    workloadIncluded: (t: string) => (fr ? `Corrections incluses : ${t} de travail.` : `Fixes included: ${t} of work.`),
    workloadOption: (t: string, price: string) =>
      fr
        ? `Les autres corrections représentent ${t} de plus, soit ${price} au taux horaire, si vous souhaitez les ajouter.`
        : `The remaining fixes would add ${t}, or ${price} at the hourly rate, if you want them too.`,
    offersTitle: (alt: boolean) =>
      alt ? (fr ? "Les formules au choix" : "Options to choose from") : fr ? "Les prestations" : "The services",
    offersIntro: (alt: boolean) =>
      alt
        ? fr
          ? "Choisissez la formule qui vous convient. Chacune est décrite avec ce qu’elle contient, sa durée et son prix."
          : "Pick the option that suits you. Each one lists what it contains, how long it takes and what it costs."
        : null,
    offerMeta: (o: OfferSnapshot, hourlyTime: string) => {
      const when =
        o.kind === "monthly"
          ? fr
            ? `Mensuel, engagement ${o.duration} mois minimum`
            : `Monthly, ${o.duration}-month minimum`
          : fr
            ? `Livré en ${o.duration} jours`
            : `Delivered in ${o.duration} days`;
      const work =
        o.billing === "hourly"
          ? fr
            ? `${hourlyTime} de travail estimé`
            : `${hourlyTime} of estimated work`
          : o.kind === "monthly"
            ? fr
              ? `environ ${o.estimatedHours} h de travail par mois`
              : `about ${o.estimatedHours} h of work a month`
            : fr
              ? `environ ${o.estimatedHours} h de travail`
              : `about ${o.estimatedHours} h of work`;
      return `${when} · ${work}`;
    },
    perMonth: fr ? " / mois" : " / month",
    investment: fr ? "Investissement" : "Investment",
    total: fr ? "Total" : "Total",
    totalOnce: fr ? "Total à la commande" : "Due upfront",
    totalMonthly: fr ? "Puis chaque mois" : "Then every month",
    alternativesNote: fr
      ? "Les formules ne s’additionnent pas : le prix dépend de celle que vous choisissez."
      : "The options do not add up: the price depends on the one you choose.",
    exclTax: fr ? "Montants hors taxes." : "Amounts exclude tax.",
    standToday: fr ? "Votre point de départ" : "Where you stand today",
    stats: fr
      ? ["Mots-clés suivis", "Déjà positionnés", "En première page", "Proches de la première page (11–20)"]
      : ["Keywords tracked", "Already ranking", "On page one", "Close to page one (11–20)"],
    keywords: fr ? "Les mots-clés" : "The keywords",
    kwHead: fr ? ["MOT-CLÉ", "INTENTION", "ACTUEL", "PAGE"] : ["KEYWORD", "INTENT", "NOW", "PAGE"],
    needsPage: fr ? "page à créer" : "needs a page",
    notChecked: fr
      ? "Positions pas encore mesurées : le premier relevé est fait après la validation de ce plan."
      : "Positions not measured yet: the first check runs once this plan is approved.",
    nowNote: fr
      ? "« Actuel » est la position Google aujourd’hui, vide quand le site n’est pas encore positionné."
      : "“Now” is the current Google position, blank where the site does not rank for it yet.",
    forExample: (list: string) => (fr ? `Par exemple : ${list}.` : `For example: ${list}.`),
    notRanking: fr ? "pas encore positionné" : "not ranking yet",
    at: (n: number) => (fr ? `en position ${n}` : `at #${n}`),
    when: fr ? "Ce qui se passe, et quand" : "What happens, and when",
    timingNote: fr
      ? "Un mot sur les délais. L’essentiel de ce qui suit est construit le premier mois et se voit au troisième : les moteurs doivent revisiter les pages, les réévaluer, puis les déplacer. Comptez les premiers mouvements de positions vers le 60e à 90e jour, et jugez les deux premiers mois sur le travail réalisé plutôt que sur la courbe de trafic."
      : "A note on timing. Most of what follows is built in the first month and " +
        "shows up in the third: search engines have to re-crawl the pages, " +
        "re-evaluate them, and then move them. Expect the first ranking " +
        "movement around day 60 to 90, and read months one and two by whether " +
        "the work below actually happened rather than by the traffic line.",
    intent: (intent: string) =>
      ({
        transactional: fr ? "prêt à acheter" : "ready to buy",
        commercial: fr ? "compare" : "comparing",
        navigational: fr ? "vous cherche" : "looking for you",
        informational: fr ? "se renseigne" : "researching",
      })[intent] ?? intent,
    terms: fr ? "Conditions" : "Terms",
  };
}

const INK = "#111827";
const MUTE = "#6b7280";
const RULE = "#e5e7eb";

export async function generateProposalPdf(
  proposal: ProposalDoc,
): Promise<Buffer> {
  const brand = await loadBrand();
  const accent = accentColor(brand);
  const L = labelsFor(proposal.locale ?? "en");
  const cash = (n: number) => money(n, proposal.currency, L.locale);
  const quote = proposal.quote ?? null;
  const agency = isWhiteLabelled(brand) ? brand.name!.trim() : null;

  const buffers: Buffer[] = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 56, right: 56 },
    info: {
      Title: proposal.title,
      // The PDF metadata is a white-label surface too. A prospect opening
      // Document Properties should see the agency, not our product.
      Author: agency ?? "SEO Tool",
      Subject: L.subject(proposal.prospectName),
    },
  });

  doc.on("data", (c: Buffer) => buffers.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });

  const hasInter = registerInterFonts(doc);
  const F = (s: "regular" | "bold" | "italic") => pickFont(hasInter, s);
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const ensure = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  };

  // ---- Cover -------------------------------------------------------
  drawLogo(doc, brand);

  doc.moveDown(2);
  doc.font(F("bold")).fontSize(26).fillColor(INK).text(proposal.title, {
    width,
  });

  doc.moveDown(0.4);
  doc
    .font(F("regular"))
    .fontSize(12)
    .fillColor(MUTE)
    .text(
      `${L.preparedFor(proposal.prospectName)}${proposal.prospectUrl ? ` · ${stripScheme(proposal.prospectUrl)}` : ""}`,
      { width },
    );

  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(
      `${agency ? `${agency} · ` : ""}${L.date(new Date())}`,
      { width },
    );

  doc.moveDown(1);
  rule(doc, accent, width);

  // ---- Intro -------------------------------------------------------
  if (proposal.intro?.trim()) {
    doc.moveDown(1);
    doc.font(F("regular")).fontSize(11).fillColor(INK).text(proposal.intro.trim(), {
      width,
      align: "left",
      lineGap: 3,
    });
  }

  // ---- What we found ----------------------------------------------
  //
  // Cited with its date. A proposal quoting a crawl from four months ago
  // is worse than one quoting none, and the prospect can check.
  if (proposal.basedOnScore !== null || proposal.scope.length > 0) {
    doc.moveDown(1.5);
    ensure(90);
    heading(doc, F, L.found, accent);

    const totalFindings = proposal.scope.reduce((n, s) => n + s.findings, 0);
    const parts: string[] = [];
    if (proposal.basedOnScore !== null) {
      parts.push(L.foundScore(proposal.basedOnScore));
    }
    if (totalFindings > 0) {
      parts.push(L.foundIssues(totalFindings));
    }

    doc
      .font(F("regular"))
      .fontSize(11)
      .fillColor(INK)
      .text(
        L.foundSentence(
          stripScheme(proposal.prospectUrl ?? proposal.prospectName),
          proposal.basedOnAt ? L.date(proposal.basedOnAt) : null,
          parts,
        ),
        { width, lineGap: 3 },
      );
  }

  // ---- Where we'll work --------------------------------------------
  // Placed before the findings-derived scope on purpose. Findings say
  // what is broken; this says what the engagement covers, and a reader
  // needs the boundary before the detail. The out-of-scope half is the
  // part that prevents the month-three conversation that starts "I
  // assumed you were also doing…".
  const sf = proposal.surfaces;
  if (sf && (sf.inScope.length > 0 || sf.outOfScope.length > 0)) {
    doc.moveDown(1.4);
    ensure(90);
    heading(doc, F, L.whereWork, accent);

    for (const line of sf.inScope) {
      ensure(52);
      doc.moveDown(0.45);
      doc
        .font(F("bold"))
        .fontSize(11.5)
        .fillColor(INK)
        .text(line.label, doc.page.margins.left, doc.y, { width });
      doc
        .font(F("regular"))
        .fontSize(10)
        .fillColor(MUTE)
        .text(line.detail, doc.page.margins.left, doc.y + 2, {
          width,
          lineGap: 2,
        });
    }

    if (sf.outOfScope.length > 0) {
      doc.moveDown(0.7);
      ensure(36);
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          L.notIncluded(sf.outOfScope.map((o) => o.label.toLowerCase()).join(", ")),
          doc.page.margins.left,
          doc.y,
          { width, lineGap: 2 },
        );
    }
  }

  // ---- Scope -------------------------------------------------------
  if (proposal.scope.length > 0) {
    doc.moveDown(1.4);
    ensure(80);
    heading(doc, F, L.scope, accent);

    for (const line of proposal.scope) {
      ensure(64);
      doc.moveDown(0.5);

      const y = doc.y;
      doc.font(F("bold")).fontSize(11.5).fillColor(INK).text(line.label, {
        width: width - 130,
        continued: false,
      });

      // Real count, right-aligned on the label's line.
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          line.minutesEach !== undefined && quote
            ? `${L.findings(line.findings)} · ${formatDuration(lineMinutes(line, SEVERITIES))}`
            : L.findings(line.findings),
          doc.page.margins.left + width - 130,
          y + 1,
          { width: 130, align: "right" },
        );

      doc.x = doc.page.margins.left;
      doc
        .font(F("regular"))
        .fontSize(10)
        .fillColor(MUTE)
        .text(line.detail, doc.page.margins.left, doc.y + 2, {
          width,
          lineGap: 2,
        });
    }
  }

  // ---- Workload by severity -----------------------------------------
  // The same findings, counted by how serious they are, with the time
  // each level takes. The quote covers the ticked levels; the rest is
  // priced as an option so the client can see what it would add.
  const graded = proposal.scope.some((l) => l.bySeverity && l.minutesEach !== undefined);
  if (quote && graded) {
    doc.moveDown(1.4);
    ensure(120);
    heading(doc, F, L.severityTitle, accent);
    doc.moveDown(0.3);

    const Lx = doc.page.margins.left;
    const cSev = Math.round(width * 0.4);
    const cErr = Math.round(width * 0.18);
    const cTime = Math.round(width * 0.2);
    const head = doc.y;
    doc.font(F("bold")).fontSize(8.5).fillColor(MUTE);
    doc.text(L.severityHead[0], Lx, head, { width: cSev });
    doc.text(L.severityHead[1], Lx + cSev, head, { width: cErr, align: "right" });
    doc.text(L.severityHead[2], Lx + cSev + cErr, head, { width: cTime, align: "right" });
    doc.x = Lx;
    doc.y = head + 12;
    rule(doc, RULE, width);
    doc.moveDown(0.35);

    for (const r of bySeverity(proposal.scope, quote.severities)) {
      if (r.findings === 0) continue;
      ensure(18);
      const y = doc.y;
      doc.font(F(r.included ? "bold" : "regular")).fontSize(10).fillColor(INK);
      doc.text(L.severity(r.severity), Lx, y, { width: cSev, lineBreak: false });
      doc.font(F("regular"));
      doc.text(String(r.findings), Lx + cSev, y, { width: cErr, align: "right", lineBreak: false });
      doc.text(formatDuration(r.minutes), Lx + cSev + cErr, y, { width: cTime, align: "right", lineBreak: false });
      doc.fillColor(r.included ? accent : MUTE);
      doc.text(r.included ? L.inQuote : L.asOption, Lx + cSev + cErr + cTime + 12, y, {
        width: width - cSev - cErr - cTime - 12,
        lineBreak: false,
      });
      doc.x = Lx;
      doc.y = y + 15;
    }

    const work = workload(proposal.scope, quote);
    doc.moveDown(0.4);
    doc
      .font(F("regular"))
      .fontSize(10)
      .fillColor(INK)
      .text(L.workloadIncluded(formatDuration(work.includedMinutes)), Lx, doc.y, { width, lineGap: 2 });
    if (work.optionMinutes > 0) {
      doc
        .fillColor(MUTE)
        .text(
          L.workloadOption(
            formatDuration(work.optionMinutes),
            cash(Math.round(billableHours(work.optionMinutes) * quote.hourlyRate)),
          ),
          Lx,
          doc.y + 2,
          { width, lineGap: 2 },
        );
    }
  }

  // ---- The services --------------------------------------------------
  // What the client is buying, in the words of the catalogue: what it
  // brings, what is delivered, how long it takes and how much work it is.
  const offers = proposal.offers ?? [];
  const alternatives = Boolean(quote?.alternatives) && offers.length > 1;
  if (offers.length > 0) {
    doc.moveDown(1.4);
    ensure(120);
    heading(doc, F, L.offersTitle(alternatives), accent);
    const intro = L.offersIntro(alternatives);
    if (intro) {
      doc.font(F("regular")).fontSize(9.5).fillColor(MUTE).text(intro, { width, lineGap: 2 });
    }
    const hourlyTime = quote ? formatDuration(workload(proposal.scope, quote).includedMinutes) : "";

    for (const o of offers) {
      ensure(90);
      doc.moveDown(0.7);
      const priceLine = proposal.pricing.find((p) => p.offerId === o.offerId);
      const y = doc.y;
      doc.font(F("bold")).fontSize(12).fillColor(INK).text(o.name, doc.page.margins.left, y, {
        width: width - 140,
      });
      if (priceLine) {
        doc
          .font(F("bold"))
          .fontSize(11.5)
          .fillColor(accent)
          .text(
            `${cash(priceLine.amount)}${priceLine.recurring ? L.perMonth : ""}`,
            doc.page.margins.left + width - 140,
            y,
            { width: 140, align: "right" },
          );
      }
      doc.x = doc.page.margins.left;
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(L.offerMeta(o, hourlyTime), doc.page.margins.left, doc.y + 2, { width });
      if (o.summary.trim()) {
        doc.fontSize(10).fillColor(INK).text(o.summary.trim(), doc.page.margins.left, doc.y + 3, {
          width,
          lineGap: 2,
        });
      }
      for (const d of o.deliverables) {
        ensure(18);
        doc
          .font(F("regular"))
          .fontSize(10)
          .fillColor(MUTE)
          .text(`·  ${d}`, doc.page.margins.left + 10, doc.y + 2, { width: width - 10, lineGap: 2 });
      }
      doc.x = doc.page.margins.left;
    }
  }

  // ---- Where you stand today ---------------------------------------
  // The starting line, in writing. Without it the first monthly report
  // has nothing to compare against and "we improved things" is unprovable.
  const kb = proposal.keywordBaseline;
  if (kb && kb.tracked > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, L.standToday, accent);
    doc.moveDown(0.4);

    // Nothing checked yet: a dash, not a 0 that reads as a measurement.
    const unmeasured = kb.checked === 0;
    const n = (v: number) => (unmeasured ? "—" : String(v));
    const stats: [string, string][] = [
      [L.stats[0], String(kb.tracked)],
      [L.stats[1], n(kb.ranking)],
      [L.stats[2], n(kb.inTopTen)],
      [L.stats[3], n(kb.strikingDistance)],
    ];
    for (const [label, value] of stats) {
      ensure(20);
      const y = doc.y;
      doc
        .font(F("regular"))
        .fontSize(10.5)
        .fillColor(MUTE)
        .text(label, doc.page.margins.left, y, { width: width - 70 });
      doc
        .font(F("bold"))
        .fontSize(10.5)
        .fillColor(INK)
        .text(value, doc.page.margins.left + width - 70, y, {
          width: 70,
          align: "right",
        });
      doc.x = doc.page.margins.left;
    }
    if (unmeasured) {
      ensure(16);
      doc.moveDown(0.3);
      doc.font(F("regular")).fontSize(8.5).fillColor(MUTE).text(L.notChecked, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
      doc.x = doc.page.margins.left;
    }

    // The list itself.
    //
    // This used to be "For example:" and three keywords. The keyword
    // list is the one part of the document a client can check against
    // their own knowledge of their business — it is what they will push
    // back on, and withholding it made the numbers above unarguable
    // rather than trustworthy. Falls back to the old sentence for
    // documents built before the map existed.
    if (kb.map && kb.map.length > 0) {
      doc.moveDown(0.9);
      ensure(70);
      doc
        .font(F("bold"))
        .fontSize(10.5)
        .fillColor(INK)
        .text(L.keywords, doc.page.margins.left, doc.y, { width });
      doc.moveDown(0.3);

      // Column geometry, once. Position is right-aligned because a
      // column of numbers that does not line up is harder to scan than
      // no column at all.
      const cKw = Math.round(width * 0.42);
      const cIntent = Math.round(width * 0.2);
      const cPos = Math.round(width * 0.1);
      const cPage = width - cKw - cIntent - cPos;
      const X = doc.page.margins.left;

      const headRow = doc.y;
      doc.font(F("bold")).fontSize(8.5).fillColor(MUTE);
      doc.text(L.kwHead[0], X, headRow, { width: cKw });
      doc.text(L.kwHead[1], X + cKw, headRow, { width: cIntent });
      doc.text(L.kwHead[2], X + cKw + cIntent, headRow, {
        width: cPos,
        align: "right",
      });
      doc.text(L.kwHead[3], X + cKw + cIntent + cPos + 8, headRow, {
        width: cPage - 8,
      });
      doc.x = X;
      doc.y = headRow + 12;
      rule(doc, RULE, width);
      doc.moveDown(0.35);

      for (const k of kb.map) {
        ensure(18);
        const y = doc.y;
        doc.font(F("regular")).fontSize(9.5).fillColor(INK);
        doc.text(k.keyword, X, y, { width: cKw - 6, ellipsis: true, lineBreak: false });
        doc.fillColor(MUTE);
        doc.text(L.intent(k.intent), X + cKw, y, {
          width: cIntent,
          lineBreak: false,
        });
        doc.fillColor(k.position === null ? MUTE : INK);
        doc.text(
          k.position === null ? "—" : String(k.position),
          X + cKw + cIntent,
          y,
          { width: cPos, align: "right", lineBreak: false },
        );
        doc.fillColor(MUTE);
        doc.text(k.targetPage ?? L.needsPage, X + cKw + cIntent + cPos + 8, y, {
          width: cPage - 8,
          ellipsis: true,
          lineBreak: false,
        });
        doc.x = X;
        doc.y = y + 13;
      }

      doc.moveDown(0.5);
      doc
        .font(F("regular"))
        .fontSize(8.5)
        .fillColor(MUTE)
        .text(
          L.nowNote,
          X,
          doc.y,
          { width, lineGap: 2 },
        );
    } else if (kb.examples.length > 0) {
      doc.moveDown(0.6);
      ensure(40);
      doc
        .font(F("regular"))
        .fontSize(9.5)
        .fillColor(MUTE)
        .text(
          L.forExample(
            kb.examples
              .map((e) => `“${e.keyword}” ${e.position === null ? L.notRanking : L.at(e.position)}`)
              .join(", "),
          ),
          doc.page.margins.left,
          doc.y,
          { width, lineGap: 2 },
        );
    }
  }

  // ---- The plan ----------------------------------------------------
  const timeline = proposal.timeline;
  if (timeline && timeline.length > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, L.when, accent);

    // When to expect results, said before the plan rather than after it.
    //
    // Search takes roughly 60 to 90 days to move, which means the work in
    // month one shows up in month three. A client who is not told that
    // reads month one's report, sees flat traffic, and concludes it is
    // not working — at exactly the point where nothing could have shown
    // yet. Saying it here costs a paragraph and is the difference between
    // a client who waits and one who leaves.
    doc
      .font(F("regular"))
      .fontSize(9)
      .fillColor(MUTE)
      .text(
        L.timingNote,
        { lineGap: 2 },
      );
    doc.moveDown(0.9);
    doc.fillColor(INK);

    // Phase banners between the weeks.
    //
    // A list of thirteen weeks is a list; the phases are what make it a
    // plan a client can hold in their head. Printed only when the phase
    // changes, and skipped entirely on documents built before phases
    // existed — where `phase` is undefined, this renders exactly as it
    // used to.
    let lastPhase: string | null = null;

    for (const phase of timeline) {
      if (phase.phase && phase.phase !== lastPhase) {
        lastPhase = phase.phase;
        ensure(46);
        doc.moveDown(timeline[0] === phase ? 0.4 : 1);
        doc
          .font(F("bold"))
          .fontSize(9)
          .fillColor(accent)
          .text(phaseText(phase.phase, L.locale).toUpperCase(), doc.page.margins.left, doc.y, {
            width,
            characterSpacing: 0.6,
          });
        doc.moveDown(0.15);
        rule(doc, RULE, width);
      }

      ensure(70);
      doc.moveDown(0.5);
      doc
        .font(F("bold"))
        .fontSize(11.5)
        .fillColor(INK)
        .text(`${weekText(phase.week, L.locale)} — ${focusText(phase.focus, L.locale)}`, doc.page.margins.left, doc.y, {
          width,
        });
      for (const item of phase.items) {
        ensure(18);
        doc
          .font(F("regular"))
          .fontSize(10)
          .fillColor(MUTE)
          .text(`·  ${item}`, doc.page.margins.left + 10, doc.y + 2, {
            width: width - 10,
            lineGap: 2,
          });
      }
      doc.x = doc.page.margins.left;
    }
  }

  // ---- Pricing -----------------------------------------------------
  if (proposal.pricing.length > 0) {
    doc.moveDown(1.6);
    ensure(120);
    heading(doc, F, L.investment, accent);
    doc.moveDown(0.4);

    for (const item of proposal.pricing) {
      ensure(40);

      const y = doc.y;
      // Positioned explicitly: the previous line's amount leaves the
      // cursor in the right-hand column.
      doc.font(F("bold")).fontSize(11).fillColor(INK).text(item.label, doc.page.margins.left, y, {
        width: width - 130,
      });
      doc
        .font(F("bold"))
        .fontSize(11)
        .fillColor(INK)
        .text(
          `${cash(item.amount)}${item.recurring ? L.perMonth : ""}`,
          doc.page.margins.left + width - 120,
          y,
          { width: 120, align: "right" },
        );

      if (item.detail?.trim()) {
        doc.x = doc.page.margins.left;
        doc
          .font(F("regular"))
          .fontSize(9.5)
          .fillColor(MUTE)
          .text(item.detail.replace(/[\u202f\u00a0]/g, " "), doc.page.margins.left, doc.y + 1, {
            width: width - 120,
            lineGap: 2,
          });
      }
      doc.moveDown(0.5);
    }

    ensure(40);
    doc.moveDown(0.3);
    rule(doc, RULE, width);
    doc.moveDown(0.5);

    // Options to choose from are not a bundle: adding them up would
    // quote a price nobody will pay.
    if (alternatives) {
      doc.font(F("regular")).fontSize(10).fillColor(MUTE).text(L.alternativesNote, { width, lineGap: 2 });
    } else {
      const sum = totals(proposal.pricing);
      const rows: [string, string][] = [];
      if (sum.monthly === 0) rows.push([L.total, cash(sum.once)]);
      else {
        if (sum.once > 0) rows.push([L.totalOnce, cash(sum.once)]);
        rows.push([L.totalMonthly, `${cash(sum.monthly)}${L.perMonth}`]);
      }
      for (const [label, value] of rows) {
        const y = doc.y;
        doc.font(F("bold")).fontSize(12).fillColor(INK).text(label, doc.page.margins.left, y, { width: width - 160 });
        doc
          .font(F("bold"))
          .fontSize(12)
          .fillColor(accent)
          .text(value, doc.page.margins.left + width - 160, y, { width: 160, align: "right" });
        doc.x = doc.page.margins.left;
        doc.moveDown(0.3);
      }
    }
    doc.font(F("regular")).fontSize(8.5).fillColor(MUTE).text(L.exclTax, doc.page.margins.left, doc.y + 2, { width });
    doc.x = doc.page.margins.left;
  }

  // ---- Terms -------------------------------------------------------
  if (proposal.terms?.trim()) {
    doc.moveDown(1.6);
    ensure(80);
    heading(doc, F, L.terms, accent);
    doc.moveDown(0.3);
    doc
      .font(F("regular"))
      .fontSize(10)
      .fillColor(MUTE)
      .text(proposal.terms.trim(), { width, lineGap: 3 });
  }

  // ---- Footer ------------------------------------------------------
  if (agency) {
    doc.moveDown(2);
    ensure(50);
    rule(doc, RULE, width);
    doc.moveDown(0.5);
    const contact = [brand.website, brand.email, brand.phone]
      .filter(Boolean)
      .join("  ·  ");
    doc
      .font(F("regular"))
      .fontSize(9)
      .fillColor(MUTE)
      .text(contact ? `${agency}  ·  ${contact}` : agency, { width });
    if (brand.footerText) {
      doc.fontSize(8).text(brand.footerText, { width });
    }
  }

  doc.end();
  return done;
}

function drawLogo(doc: PDFKit.PDFDocument, brand: Brand) {
  if (!brand.logoBuffer) return;
  try {
    doc.image(brand.logoBuffer, doc.page.margins.left, doc.page.margins.top, {
      fit: [150, 46],
    });
    doc.y = doc.page.margins.top + 56;
  } catch {
    // A corrupt logo must not cost the whole proposal.
  }
}

function heading(
  doc: PDFKit.PDFDocument,
  F: (s: "regular" | "bold" | "italic") => string,
  text: string,
  accent: string,
) {
  doc.font(F("bold")).fontSize(9).fillColor(accent).text(text.toUpperCase(), {
    characterSpacing: 1.2,
  });
  doc.moveDown(0.25);
}

function rule(doc: PDFKit.PDFDocument, color: string, width: number) {
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.margins.left + width, doc.y)
    .lineWidth(1)
    .strokeColor(color)
    .stroke();
  doc.y += 2;
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/**
 * Format money without pretending to know more than we do.
 *
 * Falls back to "CODE 1,234" for anything Intl doesn't recognise rather
 * than throwing — a typo in a currency field should not take down the
 * document someone is about to send a client.
 */
function money(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    })
      .format(amount)
      // French groups thousands with a narrow no-break space, which the
      // PDF fonts lack: it printed "1 /110 €".
      .replace(/[\u202f\u00a0]/g, " ");
  } catch {
    return `${currency} ${amount.toLocaleString(locale)}`;
  }
}

/**
 * The PDF of a stored proposal, read from its frozen columns.
 *
 * Shared by the app's download and the client portal, so both always
 * render the same document.
 */
export function proposalPdfFromRow(row: Proposal, locale: string): Promise<Buffer> {
  return generateProposalPdf({
    prospectName: row.prospectName,
    prospectUrl: row.prospectUrl,
    title: row.title,
    intro: row.intro,
    scope: row.scopeJson ?? [],
    pricing: row.pricingJson ?? [],
    offers: row.offersJson ?? null,
    quote: row.quoteJson ?? null,
    locale,
    currency: row.currency,
    terms: row.terms,
    basedOnScore: row.basedOnScore,
    basedOnAt: row.basedOnAt,
    // Present only on kickoff documents; the PDF skips both sections when
    // they're null, so ordinary sales proposals render exactly as before.
    keywordBaseline: row.baselineJson ?? null,
    timeline: row.timelineJson ?? null,
    // Read from the frozen column, never recomputed from the client
    // record. What they agreed to has to keep reading the same after
    // somebody edits the client's scope next month.
    surfaces: row.surfacesJson ? splitSurfaces(surfacesFor(row.surfacesJson, null), locale) : null,
  });
}

/**
 * The plan's week, phase and focus labels are stored in English in each
 * document (frozen when it was built). They are translated here, when the
 * PDF is drawn, so documents built before French labels existed read in
 * French too. An unknown label (written by hand) is shown as it is.
 */
const PHASE_FR: Record<string, string> = {
  "Foundation · days 1-30": "Fondations · jours 1 à 30",
  "Content and authority · days 31-60": "Contenus et autorité · jours 31 à 60",
  "Compound growth · days 61-90": "Croissance · jours 61 à 90",
};
const FOCUS_FR: Record<string, string> = {
  "technical foundations": "fondations techniques",
  "keywords and rankings": "mots-clés et positions",
  content: "contenus",
  "links and outreach": "liens et relations presse",
  "local presence": "présence locale",
  "ongoing work": "suivi courant",
};
function isFrench(locale: string): boolean {
  return locale.startsWith("fr");
}
function phaseText(phase: string, locale: string): string {
  return isFrench(locale) ? (PHASE_FR[phase] ?? phase) : phase;
}
function focusText(focus: string, locale: string): string {
  return isFrench(locale) ? (FOCUS_FR[focus] ?? focus) : focus;
}
function weekText(week: string, locale: string): string {
  return isFrench(locale) ? week.replace(/^Week (\d+)$/, "Semaine $1") : week;
}

/** A file name for the proposal's PDF. */
export function proposalPdfName(prospectName: string): string {
  const slug =
    prospectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "proposal";
  return `${slug}-proposal.pdf`;
}
