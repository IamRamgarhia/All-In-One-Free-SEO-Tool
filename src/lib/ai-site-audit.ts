/**
 * AI-driven single-page audit. Combines our existing heuristic page
 * inspectors (mobile, schema, social, EEAT) + a fresh fetch + a
 * 25-point SEO checklist. Each FAIL or WARN gets an AI-written
 * fix-steps block.
 *
 * Stores results in the existing audits + audit_issues tables with
 * `kind = "ai_full"` so the existing audit history view + reports
 * keep working.
 */

import { getReportLocale } from "./report-i18n";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, type NewAuditIssue } from "@/db/schema";
import { callAI } from "./ai-call";
import {
  validateSchemaFromUrl,
  extractSocialPreviews,
  checkMobileFriendliness,
  extractAnchorDistribution,
} from "./page-inspectors";
import { auditEeat } from "./eeat-audit";
import { measureCwv } from "./local-cwv";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type AuditCheck = {
  id: string;
  category:
    | "technical"
    | "on-page"
    | "content"
    | "schema"
    | "performance"
    | "mobile"
    | "social"
    | "eeat"
    | "security"
    | "accessibility";
  severity: "critical" | "high" | "medium" | "low";
  /** Short label like "HTTPS enabled". */
  title: string;
  /** True if passing, false if failing or warning. */
  pass: boolean;
  /** Human-readable detail of the finding. */
  message: string;
  /** Raw measurement / data point. */
  evidence?: string;
};

export type AiAuditResult = {
  ok: boolean;
  auditId?: number;
  url: string;
  score: number;
  passing: number;
  failing: number;
  checks: AuditCheck[];
  summary: string;
  error?: string;
};

const FETCH_TIMEOUT = 12_000;

/**
 * Main entry point. Creates an audit row, runs all checks, populates
 * audit_issues with AI-written fix steps, returns the audit ID.
 */
/**
 * Language of the checks' titles and messages, set once per run from the
 * workspace language: they are stored as written and reach tasks, the
 * report and the client's portal ("Fix: No author byline" did).
 */
let FR = false;
const tr = (en: string, fr: string): string => (FR ? fr : en);

export async function runAiSiteAudit(opts: {
  clientId: number;
  url: string;
}): Promise<AiAuditResult> {
  FR = (await getReportLocale()) === "fr";
  const url = /^https?:\/\//i.test(opts.url) ? opts.url : `https://${opts.url}`;

  // Create the audit shell
  const [created] = await db
    .insert(audits)
    .values({
      clientId: opts.clientId,
      kind: "ai_full",
      targetUrl: url,
      status: "running",
      startedAt: new Date(),
    })
    .returning();
  if (!created) {
    return empty(url, "Couldn't create audit row.");
  }

  try {
    const [pageData, eeat, mobile, schema, social, anchors, cwv] =
      await Promise.all([
        fetchPage(url),
        auditEeat({ url }).catch(() => null),
        checkMobileFriendliness(url).catch(() => null),
        validateSchemaFromUrl(url).catch(() => null),
        extractSocialPreviews(url).catch(() => null),
        extractAnchorDistribution({ url }).catch(() => null),
        measureCwv(url, { device: "mobile" }).catch(() => null),
      ]);

    if (!pageData) {
      await db
        .update(audits)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(audits.id, created.id));
      return empty(url, "Couldn't fetch the page.");
    }

    const checks: AuditCheck[] = [
      ...checkTechnical(url, pageData),
      ...checkOnPage(pageData),
      ...checkContent(pageData),
      ...checkSocial(social),
      ...checkSchema(schema),
      ...checkEeat(eeat),
      ...checkMobile(mobile),
      ...checkPerformance(cwv),
      ...checkAnchors(anchors),
      ...checkSecurity(pageData),
    ];

    const passing = checks.filter((c) => c.pass).length;
    const failing = checks.length - passing;
    const weights: Record<AuditCheck["severity"], number> = {
      critical: 4,
      high: 2,
      medium: 1,
      low: 0.5,
    };
    let earned = 0,
      possible = 0;
    for (const c of checks) {
      possible += weights[c.severity];
      if (c.pass) earned += weights[c.severity];
    }
    const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    // Generate AI fix steps for each FAILING check
    const failingChecks = checks.filter((c) => !c.pass);
    const aiPrompt = buildAiPrompt(url, failingChecks, pageData.title ?? "");
    const aiText = await callAI({
      system: AI_SYSTEM_PROMPT + languageLine(),
      user: aiPrompt,
      maxTokens: 2500,
      temperature: 0.3,
      timeoutMs: 60_000,
      feature: "general",
      ignoreCreditSaver: true,
    });

    const fixStepsByTitle = parseFixSteps(aiText ?? "");

    // Generate executive summary
    const summary = await generateSummary({
      url,
      score,
      passing,
      failing: failingChecks.length,
      topIssues: failingChecks
        .filter((c) => c.severity === "critical" || c.severity === "high")
        .slice(0, 5)
        .map((c) => c.title),
    });

    // Insert all checks as audit_issues (passing ones marked resolved).
    // AI-generated rows always get confidence="test" — the user must
    // verify these against their actual page; the AI can't measure.
    const issuesToInsert: NewAuditIssue[] = checks.map((c) => ({
      auditId: created.id,
      severity: c.severity,
      type: c.id,
      url,
      message: c.message,
      status: c.pass ? "resolved" : "new",
      fixSteps: c.pass ? null : fixStepsByTitle.get(c.title) ?? null,
      category: c.category,
      aiGenerated: true,
      confidence: "test",
    }));
    if (issuesToInsert.length > 0) {
      await db.insert(auditIssues).values(issuesToInsert);
    }

    await db
      .update(audits)
      .set({
        status: "completed",
        score,
        issuesCount: failing,
        // The AI audit analyses one URL, by design — so the count is
        // genuinely 1, not unknown. Recording it keeps the audit list
        // from showing a blank next to a run that did complete.
        pagesCrawled: 1,
        completedAt: new Date(),
        summary,
      })
      .where(eq(audits.id, created.id));

    return {
      ok: true,
      auditId: created.id,
      url,
      score,
      passing,
      failing,
      checks,
      summary,
    };
  } catch (err) {
    await db
      .update(audits)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(audits.id, created.id))
      .catch(() => {});
    return empty(url, (err as Error).message ?? "Audit failed");
  }
}

// =====================
// 25-point checklist
// =====================

type PageData = {
  status: number;
  finalUrl: string;
  isHttps: boolean;
  html: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  h1Count: number;
  h1Texts: string[];
  h2Count: number;
  imageCount: number;
  imagesWithAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  wordCount: number;
  hasViewport: boolean;
  responseHeaders: Record<string, string>;
  hasOg: boolean;
  hasTwitterCard: boolean;
  hasJsonLd: boolean;
};

async function fetchPage(url: string): Promise<PageData | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    const html = (await res.text()).slice(0, 1_500_000);
    const finalUrl = res.url;

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const title = match(html, /<title[^>]*>([^<]+)<\/title>/i);
    const metaDescription = match(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
    );
    const canonical = match(
      html,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i,
    );
    const metaRobots = match(
      html,
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i,
    );
    const h1Texts: string[] = [];
    for (const m of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) {
      const t = stripTags(m[1]).trim();
      if (t) h1Texts.push(t);
    }
    const h2Count = (html.match(/<h2\b/gi) ?? []).length;
    const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi));
    const imagesWithAlt = imgs.filter((m) =>
      /\salt=["'][^"']{2,}["']/i.test(m[0]),
    ).length;
    const host = (() => {
      try {
        return new URL(finalUrl).hostname;
      } catch {
        return "";
      }
    })();
    let internalLinks = 0;
    let externalLinks = 0;
    for (const m of html.matchAll(
      /<a\s[^>]*href=["']([^"']+)["']/gi,
    )) {
      const href = m[1];
      if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
      try {
        const u = new URL(href, finalUrl);
        if (u.hostname === host) internalLinks += 1;
        else externalLinks += 1;
      } catch {
        // ignore
      }
    }

    const text = stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return {
      status: res.status,
      finalUrl,
      isHttps: /^https:\/\//i.test(finalUrl),
      html,
      title,
      metaDescription,
      canonical,
      metaRobots,
      h1Count: h1Texts.length,
      h1Texts,
      h2Count,
      imageCount: imgs.length,
      imagesWithAlt,
      internalLinkCount: internalLinks,
      externalLinkCount: externalLinks,
      wordCount,
      hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      responseHeaders: headers,
      hasOg: /property=["']og:/i.test(html),
      hasTwitterCard: /name=["']twitter:card["']/i.test(html),
      hasJsonLd: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function checkTechnical(url: string, p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  out.push({
    id: "https",
    category: "technical",
    severity: "critical",
    title: "HTTPS",
    pass: p.isHttps,
    message: p.isHttps ? tr("Page is served over HTTPS.", "La page est servie en HTTPS.") : tr("Page is on HTTP — Google has used HTTPS as a signal since 2014.", "La page est en HTTP : Google utilise le HTTPS comme signal de classement depuis 2014."),
    evidence: `final URL: ${p.finalUrl}`,
  });
  out.push({
    id: "status",
    category: "technical",
    severity: "critical",
    title: tr("200 OK status", "Statut 200 OK"),
    pass: p.status >= 200 && p.status < 300,
    message: p.status >= 200 && p.status < 300 ? tr(`Returns ${p.status}.`, `Répond ${p.status}.`) : tr(`Returns ${p.status} — broken or redirecting unexpectedly.`, `Répond ${p.status} : page en erreur ou redirigée de façon inattendue.`),
    evidence: `status: ${p.status}`,
  });
  out.push({
    id: "canonical",
    category: "technical",
    severity: "high",
    title: tr("Canonical tag", "Balise canonique"),
    pass: !!p.canonical,
    message: p.canonical
      ? tr(`Canonical points to ${p.canonical}.`, `La canonique pointe vers ${p.canonical}.`)
      : tr("No <link rel=\"canonical\"> — leaves Google to guess the canonical version.", "Pas de <link rel=\"canonical\"> : Google doit deviner la version de référence."),
    evidence: p.canonical ?? "—",
  });
  const robotsBlocked = p.metaRobots
    ? /noindex/i.test(p.metaRobots)
    : false;
  out.push({
    id: "indexable",
    category: "technical",
    severity: "critical",
    title: tr("Page is indexable", "Page indexable"),
    pass: !robotsBlocked,
    message: robotsBlocked
      ? tr(`Page has 'noindex' in <meta name="robots">: ${p.metaRobots}`, `La page contient « noindex » dans <meta name="robots"> : ${p.metaRobots}`)
      : tr("No 'noindex' directive — page is indexable.", "Pas de directive noindex : la page est indexable."),
    evidence: p.metaRobots ?? "(no robots meta)",
  });
  return out;
}

function checkOnPage(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  const titleLen = p.title?.trim().length ?? 0;
  out.push({
    id: "title",
    category: "on-page",
    severity: "high",
    title: tr("Title tag length 30-60 chars", "Title entre 30 et 60 caractères"),
    pass: titleLen >= 30 && titleLen <= 70,
    message:
      titleLen === 0
        ? tr("Page is missing a <title>.", "La page n’a pas de <title>.")
        : titleLen < 30
          ? tr(`Title is ${titleLen} chars — under the 30 char minimum.`, `Le title fait ${titleLen} caractères, sous le minimum de 30.`)
          : titleLen > 70
            ? tr(`Title is ${titleLen} chars — Google will truncate over ~60.`, `Le title fait ${titleLen} caractères : Google le coupe au-delà d’environ 60.`)
            : tr(`Title is ${titleLen} chars.`, `Le title fait ${titleLen} caractères.`),
    evidence: p.title ?? "(none)",
  });
  const metaLen = p.metaDescription?.trim().length ?? 0;
  out.push({
    id: "meta_description",
    category: "on-page",
    severity: "medium",
    title: tr("Meta description 120-160 chars", "Méta-description entre 120 et 160 caractères"),
    pass: metaLen >= 120 && metaLen <= 165,
    message:
      metaLen === 0
        ? tr("Missing meta description.", "Méta-description absente.")
        : metaLen < 120
          ? tr(`Meta description is ${metaLen} chars — too short.`, `La méta-description fait ${metaLen} caractères : trop courte.`)
          : metaLen > 165
            ? tr(`Meta description is ${metaLen} chars — Google will truncate.`, `La méta-description fait ${metaLen} caractères : Google la coupera.`)
            : tr(`Meta description is ${metaLen} chars.`, `La méta-description fait ${metaLen} caractères.`),
    evidence: p.metaDescription ?? "(none)",
  });
  out.push({
    id: "h1",
    category: "on-page",
    severity: "high",
    title: tr("Exactly one H1", "Un seul titre H1"),
    pass: p.h1Count === 1,
    message:
      p.h1Count === 0
        ? tr("No H1 found — Google relies on the H1 to disambiguate the page topic.", "Aucun H1 : le H1 aide Google à comprendre le sujet de la page.")
        : p.h1Count === 1
          ? tr(`One H1: "${p.h1Texts[0].slice(0, 80)}".`, `Un H1 : « ${p.h1Texts[0].slice(0, 80)} ».`)
          : tr(`${p.h1Count} H1s — picks one focal topic, not many.`, `${p.h1Count} H1 : gardez-en un seul, pour un sujet principal.`),
    evidence: `H1 count: ${p.h1Count}`,
  });
  out.push({
    id: "heading_structure",
    category: "on-page",
    severity: "medium",
    title: tr("Has H2 subheadings", "Sous-titres H2 présents"),
    pass: p.h2Count >= 2,
    message:
      p.h2Count >= 2
        ? tr(`${p.h2Count} H2s — good content structure.`, `${p.h2Count} H2 : contenu bien structuré.`)
        : tr(`${p.h2Count} H2s — long content needs subheadings for scanability and snippet eligibility.`, `${p.h2Count} H2 : un contenu long a besoin de sous-titres pour être parcouru facilement.`),
    evidence: `H2 count: ${p.h2Count}`,
  });
  return out;
}

function checkContent(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  out.push({
    id: "word_count",
    category: "content",
    severity: "medium",
    title: tr("Page has substantial content (≥300 words)", "Contenu suffisant (au moins 300 mots)"),
    pass: p.wordCount >= 300,
    message:
      p.wordCount >= 300
        ? tr(`${p.wordCount} words — substantial content.`, `${p.wordCount} mots : contenu suffisant.`)
        : tr(`${p.wordCount} words — likely thin. Even short pages should clear 300 words.`, `${p.wordCount} mots : contenu probablement trop mince (repère courant : 300 mots).`),
    evidence: `word count: ${p.wordCount}`,
  });
  const altCoverage = p.imageCount === 0 ? 1 : p.imagesWithAlt / p.imageCount;
  out.push({
    id: "image_alts",
    category: "content",
    severity: "medium",
    title: tr("Image alt-text coverage ≥80%", "Texte alternatif sur au moins 80 % des images"),
    pass: altCoverage >= 0.8,
    message:
      p.imageCount === 0
        ? tr("No images on page.", "Aucune image sur la page.")
        : tr(`${p.imagesWithAlt}/${p.imageCount} images have alt text (${Math.round(altCoverage * 100)}%).`, `${p.imagesWithAlt} images sur ${p.imageCount} ont un texte alternatif (${Math.round(altCoverage * 100)} %).`),
    evidence: `images: ${p.imageCount}, with alt: ${p.imagesWithAlt}`,
  });
  out.push({
    id: "internal_links",
    category: "content",
    severity: "medium",
    title: tr("Internal linking (≥3 links)", "Maillage interne (au moins 3 liens)"),
    pass: p.internalLinkCount >= 3,
    message:
      p.internalLinkCount >= 3
        ? tr(`${p.internalLinkCount} internal links — distributes link equity.`, `${p.internalLinkCount} liens internes.`)
        : tr(`Only ${p.internalLinkCount} internal links — page is isolated.`, `Seulement ${p.internalLinkCount} liens internes : la page est isolée.`),
    evidence: `internal: ${p.internalLinkCount}`,
  });
  out.push({
    id: "external_citations",
    category: "content",
    severity: "low",
    title: tr("Outbound citations (≥1 link)", "Sources citées (au moins 1 lien sortant)"),
    pass: p.externalLinkCount >= 1,
    message:
      p.externalLinkCount >= 1
        ? tr(`${p.externalLinkCount} outbound links — well-cited.`, `${p.externalLinkCount} liens sortants.`)
        : tr("No outbound citations — Google rewards well-cited content.", "Aucun lien vers une source externe."),
    evidence: `external: ${p.externalLinkCount}`,
  });
  return out;
}

function checkSocial(s: { warnings: string[]; og: { image: string | null }; twitter: { card: string | null } } | null): AuditCheck[] {
  if (!s) return [];
  return [
    {
      id: "og_image",
      category: "social",
      severity: "low",
      title: tr("OG image present", "Image Open Graph présente"),
      pass: !!s.og.image,
      message: s.og.image
        ? tr(`og:image set (${s.og.image.slice(0, 80)}).`, `og:image renseignée (${s.og.image.slice(0, 80)}).`)
        : tr("Missing og:image — share previews will be image-less.", "og:image absente : les aperçus de partage n’auront pas d’image."),
    },
    {
      id: "twitter_card",
      category: "social",
      severity: "low",
      title: tr("Twitter card present", "Carte Twitter / X présente"),
      pass: !!s.twitter.card,
      message: s.twitter.card
        ? `twitter:card = "${s.twitter.card}".`
        : tr("Missing twitter:card — defaults to a smaller share preview.", "twitter:card absente : l’aperçu de partage sera plus petit."),
    },
  ];
}

function checkSchema(s: { blocks: { errors: string[]; warnings: string[] }[] } | null): AuditCheck[] {
  if (!s) return [];
  const totalBlocks = s.blocks.length;
  const validBlocks = s.blocks.filter((b) => b.errors.length === 0).length;
  return [
    {
      id: "schema_present",
      category: "schema",
      severity: "medium",
      title: tr("Structured data (JSON-LD)", "Données structurées (JSON-LD)"),
      pass: totalBlocks > 0,
      message:
        totalBlocks > 0
          ? tr(`${totalBlocks} JSON-LD block${totalBlocks === 1 ? "" : "s"} present.`, `${totalBlocks} bloc${totalBlocks === 1 ? "" : "s"} JSON-LD présent${totalBlocks === 1 ? "" : "s"}.`)
          : tr("No JSON-LD found — missing rich-result eligibility.", "Aucun JSON-LD : la page n’est pas éligible aux résultats enrichis."),
    },
    {
      id: "schema_valid",
      category: "schema",
      severity: "high",
      title: tr("Schema is valid (no errors)", "Données structurées valides (sans erreur)"),
      pass: totalBlocks === 0 || validBlocks === totalBlocks,
      message:
        totalBlocks === 0
          ? tr("No schema to validate.", "Aucune donnée structurée à valider.")
          : validBlocks === totalBlocks
            ? tr(`All ${totalBlocks} block${totalBlocks === 1 ? "" : "s"} valid.`, `${totalBlocks === 1 ? "Le bloc est valide" : `Les ${totalBlocks} blocs sont valides`}.`)
            : tr(`${totalBlocks - validBlocks} block${totalBlocks - validBlocks === 1 ? " has" : "s have"} errors.`, `${totalBlocks - validBlocks} bloc${totalBlocks - validBlocks === 1 ? " contient" : "s contiennent"} des erreurs.`),
    },
  ];
}

function checkEeat(e: import("./eeat-audit").EeatResult | null): AuditCheck[] {
  if (!e) return [];
  return [
    {
      id: "eeat_byline",
      category: "eeat",
      severity: "high",
      title: tr("Author byline + bio (E-E-A-T)", "Auteur et biographie (E-E-A-T)"),
      pass: e.signals.hasAuthorByline && e.signals.hasAuthorBio,
      message: e.signals.hasAuthorByline
        ? e.signals.hasAuthorBio
          ? tr(`Author byline (${e.signals.authorName ?? "yes"}) + bio detected.`, `Auteur (${e.signals.authorName ?? "indiqué"}) et biographie détectés.`)
          : tr("Byline present but no bio. Add credentials + topical background.", "Auteur indiqué, sans biographie : ajoutez ses qualifications et son expérience du sujet.")
        : tr("No author byline. Anonymous content gets penalized on YMYL queries.", "Aucun auteur indiqué. Sur les sujets sensibles (santé, argent, droit), Google attend un auteur identifiable."),
    },
    {
      id: "eeat_dates",
      category: "eeat",
      severity: "medium",
      title: tr("Published + updated dates", "Dates de publication et de mise à jour"),
      pass: e.signals.hasPublishedDate && e.signals.hasUpdatedDate,
      message:
        e.signals.hasPublishedDate && e.signals.hasUpdatedDate
          ? tr("Published + last-updated dates present.", "Dates de publication et de mise à jour présentes.")
          : !e.signals.hasPublishedDate
            ? tr("Missing publish date.", "Date de publication absente.")
            : tr("Missing 'last-updated' date — Google rewards demonstrable freshness.", "Date de mise à jour absente : elle montre que le contenu est tenu à jour."),
    },
    {
      id: "eeat_authoritative",
      category: "eeat",
      severity: "medium",
      title: tr("Authoritative outbound citations", "Sources de référence citées"),
      pass: e.signals.authoritativeCitationCount >= 1,
      message:
        e.signals.authoritativeCitationCount > 0
          ? tr(`${e.signals.authoritativeCitationCount} citations to authoritative sources (.gov / .edu / Wikipedia / known publishers).`, `${e.signals.authoritativeCitationCount} liens vers des sources de référence (.gouv, .edu, Wikipédia, éditeurs reconnus).`)
          : tr("No citations to authoritative sources detected.", "Aucun lien vers une source de référence."),
    },
  ];
}

function checkMobile(m: import("./page-inspectors").MobileFriendlyCheck | null): AuditCheck[] {
  if (!m) return [];
  return [
    {
      id: "mobile_viewport",
      category: "mobile",
      severity: "critical",
      title: tr("Viewport meta sane", "Balise viewport correcte"),
      pass: m.hasViewport && m.viewportSane,
      message: m.hasViewport
        ? m.viewportSane
          ? `Viewport: ${m.viewport}`
          : tr("Viewport blocks scaling — accessibility violation.", "La balise viewport bloque le zoom : défaut d’accessibilité.")
        : tr("No viewport meta — page renders desktop-width on mobile.", "Pas de balise viewport : la page s’affiche en largeur d’ordinateur sur mobile."),
    },
    {
      id: "mobile_no_interstitial",
      category: "mobile",
      severity: "medium",
      title: tr("No intrusive interstitial", "Pas de fenêtre intrusive"),
      pass: !m.hasInterstitial,
      message: m.hasInterstitial
        ? tr("Modal / popup / cookie banner / GDPR overlay detected — Google penalizes intrusive interstitials on mobile.", "Fenêtre, pop-up ou bandeau de cookies détecté qui recouvre la page : Google pénalise les interstitiels intrusifs sur mobile.")
        : tr("No intrusive overlay detected.", "Aucune fenêtre intrusive détectée."),
    },
  ];
}

function checkPerformance(c: import("./local-cwv").CwvResult | null): AuditCheck[] {
  if (!c || !c.ok) return [];
  return [
    {
      id: "perf_lcp",
      category: "performance",
      severity: "high",
      title: tr("LCP under 2.5s (mobile)", "LCP sous 2,5 s (mobile)"),
      pass: c.lcpMs !== null && c.lcpMs <= 2500,
      message:
        c.lcpMs === null
          ? tr("LCP not measured.", "LCP non mesuré.")
          : c.lcpMs <= 2500
            ? tr(`LCP ${(c.lcpMs / 1000).toFixed(2)}s — good.`, `LCP ${(c.lcpMs / 1000).toFixed(2).replace(".", ",")} s : bon.`)
            : tr(`LCP ${(c.lcpMs / 1000).toFixed(2)}s — over the 2.5s threshold.`, `LCP ${(c.lcpMs / 1000).toFixed(2).replace(".", ",")} s : au-dessus du seuil de 2,5 s.`),
    },
    {
      id: "perf_cls",
      category: "performance",
      severity: "medium",
      title: tr("CLS under 0.1", "CLS sous 0,1"),
      pass: c.cls !== null && c.cls <= 0.1,
      message:
        c.cls === null
          ? tr("CLS not measured.", "CLS non mesuré.")
          : c.cls <= 0.1
            ? tr(`CLS ${c.cls.toFixed(3)} — good.`, `CLS ${c.cls.toFixed(3).replace(".", ",")} : bon.`)
            : tr(`CLS ${c.cls.toFixed(3)} — layout shifts above 0.1.`, `CLS ${c.cls.toFixed(3).replace(".", ",")} : décalages de mise en page au-dessus de 0,1.`),
    },
    {
      id: "perf_score",
      category: "performance",
      severity: "high",
      title: tr("Performance score ≥ 75", "Score de performance d’au moins 75"),
      pass: c.performanceScore !== null && c.performanceScore >= 75,
      message:
        c.performanceScore === null
          ? tr("No performance score available.", "Aucun score de performance disponible.")
          : c.performanceScore >= 75
            ? tr(`Score ${c.performanceScore}/100 — strong.`, `Score ${c.performanceScore}/100 : bon.`)
            : tr(`Score ${c.performanceScore}/100 — needs work.`, `Score ${c.performanceScore}/100 : à améliorer.`),
    },
  ];
}

function checkAnchors(a: import("./page-inspectors").AnchorDistribution | null): AuditCheck[] {
  if (!a) return [];
  return [
    {
      id: "anchor_overopt",
      category: "on-page",
      severity: "low",
      title: tr("Anchor text not over-optimized", "Textes de lien non suroptimisés"),
      pass: a.exactMatchPct < 5,
      message:
        a.exactMatchPct < 5
          ? tr(`Exact-match anchor share is ${a.exactMatchPct.toFixed(1)}% — within safe range.`, `Ancres en correspondance exacte : ${a.exactMatchPct.toFixed(1).replace(".", ",")} %, dans la normale.`)
          : tr(`${a.exactMatchPct.toFixed(1)}% exact-match anchors — over-optimization risk.`, `${a.exactMatchPct.toFixed(1).replace(".", ",")} % d’ancres en correspondance exacte : risque de suroptimisation.`),
    },
  ];
}

function checkSecurity(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  const hsts = !!p.responseHeaders["strict-transport-security"];
  out.push({
    id: "hsts",
    category: "security",
    severity: "low",
    title: tr("HSTS header set", "En-tête HSTS présent"),
    pass: hsts,
    message: hsts
      ? tr("Strict-Transport-Security header present.", "En-tête Strict-Transport-Security présent.")
      : tr("No HSTS header — browsers can't enforce HTTPS-only after first visit.", "Pas d’en-tête HSTS : le navigateur n’impose pas le HTTPS après la première visite."),
    evidence: p.responseHeaders["strict-transport-security"] ?? "(none)",
  });
  const xfo = p.responseHeaders["x-frame-options"] || p.responseHeaders["content-security-policy"];
  out.push({
    id: "clickjacking",
    category: "security",
    severity: "low",
    title: tr("Clickjacking protection", "Protection contre le détournement de clic"),
    pass: !!xfo,
    message: xfo
      ? tr("X-Frame-Options or CSP frame-ancestors set.", "X-Frame-Options ou CSP frame-ancestors en place.")
      : tr("No X-Frame-Options + no CSP frame-ancestors — page can be iframed by anyone.", "Ni X-Frame-Options ni CSP frame-ancestors : n’importe quel site peut afficher la page dans un cadre."),
  });
  return out;
}

// =====================
// AI fix-step generation
// =====================

const AI_SYSTEM_PROMPT = `You write step-by-step SEO fix instructions. Given a list of failing checks for a single web page, return ONE markdown block per check with:

- A heading: "## <exact title verbatim>"
- 3-6 specific actionable steps (numbered list)
- Reference what tooling / file the user edits (e.g. "Edit theme.liquid in Shopify", "Update title in Yoast SEO sidebar in WordPress", "Modify <head> in your Next.js layout")
- Mention the expected outcome for each step
- ≤140 words per check

Do NOT add preamble. Do NOT add a closing summary. Output only the markdown blocks separated by a blank line.`;

/** The steps are shown to the agency and its client: in their language. */
const languageLine = () =>
  FR ? "\n\nWrite the steps in French, addressing the reader as « vous ». Keep each heading exactly as given." : "";

function buildAiPrompt(
  url: string,
  failingChecks: AuditCheck[],
  pageTitle: string,
): string {
  return [
    `URL: ${url}`,
    `Page title: ${pageTitle || "(none)"}`,
    "",
    `Failing checks (write fix steps for each):`,
    ...failingChecks.map(
      (c, i) =>
        `${i + 1}. ${c.title} — ${c.message}${c.evidence ? ` (Evidence: ${c.evidence.slice(0, 200)})` : ""}`,
    ),
    "",
    "Write the markdown blocks now.",
  ].join("\n");
}

function parseFixSteps(aiText: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!aiText) return out;
  const blocks = aiText.split(/\n##\s+/);
  for (let i = 0; i < blocks.length; i++) {
    const block = (i === 0 ? blocks[i].replace(/^##\s+/, "") : blocks[i]).trim();
    if (!block) continue;
    const firstNewline = block.indexOf("\n");
    if (firstNewline === -1) continue;
    const title = block.slice(0, firstNewline).trim();
    const body = block.slice(firstNewline + 1).trim();
    if (title && body) out.set(title, body);
  }
  return out;
}

// =====================
// Summary
// =====================

async function generateSummary(opts: {
  url: string;
  score: number;
  passing: number;
  failing: number;
  topIssues: string[];
}): Promise<string> {
  if (opts.failing === 0) {
    return tr(
      `Audit complete. ${opts.url} passes all ${opts.passing} checks (score ${opts.score}/100). No critical fixes needed.`,
      `Audit terminé. ${opts.url} passe les ${opts.passing} contrôles (score ${opts.score}/100). Aucune correction critique.`,
    );
  }
  const out = await callAI({
    system:
      "You write 2-3 sentence executive summaries of an SEO audit. Direct, concrete, references specific issues by name. No preamble." +
      (FR ? " Write in French, addressing the reader as « vous »." : ""),
    user: [
      `URL: ${opts.url}`,
      `Score: ${opts.score}/100`,
      `${opts.passing} passing, ${opts.failing} failing`,
      `Top issues: ${opts.topIssues.join("; ")}`,
      "",
      "Write the summary now.",
    ].join("\n"),
    maxTokens: 200,
    temperature: 0.4,
    timeoutMs: 20_000,
    feature: "exec_summary",
  });
  return (
    out ??
    tr(
      `Audit complete. ${opts.url} scored ${opts.score}/100. ${opts.failing} fixes pending — top concerns: ${opts.topIssues.slice(0, 3).join(", ")}.`,
      `Audit terminé. ${opts.url} obtient ${opts.score}/100. ${opts.failing} corrections à faire, en priorité : ${opts.topIssues.slice(0, 3).join(", ")}.`,
    )
  );
}

// =====================
// Helpers
// =====================

function match(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}
function empty(url: string, error: string): AiAuditResult {
  return {
    ok: false,
    url,
    score: 0,
    passing: 0,
    failing: 0,
    checks: [],
    summary: "",
    error,
  };
}
