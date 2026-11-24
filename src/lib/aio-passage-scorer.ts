/**
 * AI Overview passage optimizer.
 *
 * Research from 2026 (Wellows, AI Overviews ranking factors): AIs
 * preferentially cite **134-167 word self-contained passages** that fully
 * answer a query. Content scoring 8.5/10+ on "semantic completeness" is
 * 4.2x more likely to be cited.
 *
 * This module:
 *   1) Splits a long markdown draft into chunks bounded by H2/H3 headings or
 *      paragraph runs that fall in the 80-220 word band (we widen slightly
 *      beyond the ideal so we can flag passages that are too long or too
 *      short).
 *   2) Deterministically scores each passage on five criteria the AIs
 *      actually look for: length, self-containment (no anaphoric refs to
 *      prior context), question-answer pattern, factual concreteness
 *      (numbers + proper nouns), and source citation presence.
 *   3) Optionally calls AI to give a holistic semantic-completeness score
 *      and a one-line rewrite suggestion per low-scoring passage.
 */

import { callAI } from "./ai-call";

export type PassageScore = {
  index: number;
  text: string;
  wordCount: number;
  /** 0-100. Weighted blend of the five criteria below. */
  score: number;
  criteria: {
    length: { score: number; note: string };
    selfContained: { score: number; note: string };
    answersAQuestion: { score: number; note: string };
    factualConcreteness: { score: number; note: string };
    citesSource: { score: number; note: string };
  };
  /** AI-generated rewrite hint, if requested. */
  rewriteHint?: string;
};

const ANAPHORIC_TOKENS = [
  "this",
  "that",
  "these",
  "those",
  "it",
  "they",
  "them",
  "their",
  "such",
  "above",
  "below",
  "earlier",
  "previously",
  "as discussed",
  "as we mentioned",
  "as noted",
];

/**
 * Split markdown into passage candidates. Passages are paragraphs (or
 * H2/H3 sections collapsed into one block) bounded at most by 220 words.
 */
export function splitIntoPassages(md: string): string[] {
  // Drop frontmatter + raw HTML
  const cleaned = md
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (!cleaned) return [];

  // Split on blank lines
  const blocks = cleaned.split(/\n{2,}/);
  const passages: string[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    // Heading boundaries always flush the buffer
    const isHeading = /^#{1,6}\s/.test(block);
    if (isHeading) {
      if (bufferWords > 0) {
        passages.push(buffer.join("\n\n"));
        buffer = [];
        bufferWords = 0;
      }
      // Don't include headings as standalone passages — too short
      continue;
    }
    const blockWords = block.split(/\s+/).length;
    if (bufferWords + blockWords > 220 && bufferWords > 0) {
      passages.push(buffer.join("\n\n"));
      buffer = [block];
      bufferWords = blockWords;
    } else {
      buffer.push(block);
      bufferWords += blockWords;
    }
  }
  if (buffer.length > 0) passages.push(buffer.join("\n\n"));
  return passages.filter((p) => p.split(/\s+/).length >= 25);
}

function scoreLength(words: number, fr = false): { score: number; note: string } {
  if (words >= 134 && words <= 167) {
    return { score: 100, note: fr ? "Dans la fourchette visée par cet outil (134 à 167 mots)." : "In the 134-167 ideal AIO band." };
  }
  if (words >= 110 && words <= 200) {
    return { score: 80, note: fr ? "Proche de la fourchette visée." : "Close to the ideal band." };
  }
  if (words >= 80 && words <= 220) {
    return { score: 60, note: fr ? "Hors de la fourchette visée, mais acceptable." : "Outside the ideal band but tolerable." };
  }
  if (words < 80) {
    return { score: 30, note: fr ? "Trop court : pas assez d’informations pour être cité." : "Too short — won't have enough info to be cited." };
  }
  return { score: 25, note: fr ? "Trop long : visez un passage resserré de 134 à 167 mots." : "Too long — AIs prefer focused 134-167 word chunks." };
}

function scoreSelfContained(text: string, fr = false): { score: number; note: string } {
  const lower = text.toLowerCase();
  // Only count anaphoric tokens at sentence-starts or in lead clauses
  const firstChunk = lower.slice(0, 120);
  const hits = ANAPHORIC_TOKENS.filter((tok) => firstChunk.includes(tok)).length;
  if (hits === 0)
    return { score: 100, note: fr ? "Se lit comme un passage autonome." : "Reads as a standalone passage." };
  if (hits === 1)
    return {
      score: 70,
      note: fr
        ? "Légère référence au texte qui précède. Remplacez-la par le sujet lui-même."
        : 'Mild back-reference. Replace with the actual subject.',
    };
  return {
    score: 40,
    note: fr
      ? `${hits} références au texte qui précède dans l’ouverture : le passage dépend du contexte.`
      : `${hits} back-references in opening — passage depends on prior context.`,
  };
}

function scoreAnswersAQuestion(text: string, fr = false): { score: number; note: string } {
  // Strong: starts with a noun phrase + verb pattern that looks like a
  // direct answer (e.g. "Schema markup is …", "INP measures …").
  const firstSentence = text.split(/[.!?]\s/)[0] ?? "";
  const startsWithDef = /^[A-Z][a-z]+(?:\s+\w+){0,4}\s+(is|are|means|measures|describes|refers to|is the)\s/.test(
    firstSentence,
  );
  if (startsWithDef) {
    return { score: 100, note: fr ? "S’ouvre sur une définition directe et claire." : "Opens with a clean direct definition." };
  }
  // OK: ends a paragraph with a clear takeaway sentence
  const endsWithBecause = /\b(because|so that|which means|the result is)\b/i.test(
    text,
  );
  if (endsWithBecause) {
    return {
      score: 75,
      note: fr
        ? "Structure explicative : peut être cité au milieu d’une réponse."
        : "Has explanatory structure — could be cited mid-answer.",
    };
  }
  return {
    score: 50,
    note: fr
      ? "Pas de structure question → réponse nette. Réécrivez pour commencer par une définition ou l’idée principale."
      : "No clean Q→A structure. Rewrite to lead with a definition or takeaway.",
  };
}

function scoreFactualConcreteness(text: string, fr = false): {
  score: number;
  note: string;
} {
  const numbers = (text.match(/\b\d{1,4}(?:[.,]\d+)?(?:%|\s?(?:ms|s|kb|mb|gb|x|×))?\b/gi) || []).length;
  const propers = (text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || []).length;
  const total = numbers + propers;
  const counts = `${numbers} ${numbers > 1 ? "chiffres" : "chiffre"}, ${propers} ${propers > 1 ? "noms propres" : "nom propre"}`;
  if (total >= 4)
    return { score: 100, note: fr ? `${counts}.` : `${numbers} numbers + ${propers} proper nouns.` };
  if (total >= 2)
    return { score: 70, note: fr ? `Quelques éléments précis : ${counts}.` : `Some specifics — ${numbers} numbers, ${propers} proper nouns.` };
  if (total === 1)
    return { score: 40, note: fr ? "Un seul élément précis. Ajoutez de vrais chiffres ou des noms." : "Only one specific. Add real numbers or names." };
  return { score: 20, note: fr ? "Ni chiffre ni nom propre : le passage reste vague." : "No numbers or proper nouns. Reads as filler." };
}

function scoreCitesSource(text: string, fr = false): { score: number; note: string } {
  const links = (text.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) || []).length;
  if (links >= 1)
    return {
      score: 100,
      note: fr
        ? `${links} ${links === 1 ? "source citée" : "sources citées"} en lien sortant.`
        : `${links} outbound source citation${links === 1 ? "" : "s"}.`,
    };
  return {
    score: 40,
    note: fr
      ? "Aucune source citée en lien. Citer une source reconnue peut renforcer la confiance."
      : "No outbound citation. Cite an authoritative source to boost trust.",
  };
}

/** `locale` is the language of the notes; "fr" writes them in French. */
export function scorePassage(text: string, idx: number, locale = "en"): PassageScore {
  const fr = locale === "fr";
  const words = text.split(/\s+/).filter(Boolean).length;
  const length = scoreLength(words, fr);
  const selfContained = scoreSelfContained(text, fr);
  const answersAQuestion = scoreAnswersAQuestion(text, fr);
  const factualConcreteness = scoreFactualConcreteness(text, fr);
  const citesSource = scoreCitesSource(text, fr);
  const score = Math.round(
    length.score * 0.25 +
      selfContained.score * 0.2 +
      answersAQuestion.score * 0.25 +
      factualConcreteness.score * 0.15 +
      citesSource.score * 0.15,
  );
  return {
    index: idx,
    text,
    wordCount: words,
    score,
    criteria: {
      length,
      selfContained,
      answersAQuestion,
      factualConcreteness,
      citesSource,
    },
  };
}

export function scoreAllPassages(md: string, locale = "en"): PassageScore[] {
  return splitIntoPassages(md).map((p, i) => scorePassage(p, i, locale));
}

/**
 * Optional AI rewrite hint per passage. Only call for passages scoring < 70
 * to save tokens.
 */
export async function suggestRewriteHint(
  passage: string,
  score: number,
): Promise<string | null> {
  if (score >= 70) return null;
  const text = await callAI({
    system: `You rewrite a passage so it reads as a standalone, citable AI Overview answer. Output ONLY the rewritten passage. Target 134-167 words. Open with a direct definition or takeaway. Use one specific number or proper noun. Don't begin with "this", "that", or "it".`,
    user: `Rewrite this passage so it could be cited by ChatGPT, Perplexity, or Google AI Overviews:\n\n${passage}`,
    maxTokens: 600,
    temperature: 0.4,
    feature: "content_idea",
  });
  if (!text) return null;
  return text.trim();
}
