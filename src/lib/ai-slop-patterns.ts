/**
 * 24-pattern AI slop detector — port of ericosiu/ai-marketing-skills'
 * humanizer checklist. Each pattern is detected via regex / heuristic.
 * Score starts at 100, deductions per violation. 90+ ships, <50 = full
 * rewrite.
 *
 * Patterns 1-24 mirror the source's deduction weights exactly. Patterns
 * that depend on tone/context (AI Vocabulary Clustering, Sycophantic Tone)
 * use word-density heuristics — they err on the side of false positives
 * over false negatives, which is the intent.
 */

export type SlopPattern = {
  id: number;
  name: string;
  description: string;
  deduction: number;
};

export type SlopViolation = {
  patternId: number;
  patternName: string;
  deduction: number;
  excerpt: string;
};

export type SlopReport = {
  score: number;
  verdict: "ship" | "minor" | "significant" | "full_rewrite";
  verdictLabel: string;
  totalDeductions: number;
  wordCount: number;
  violations: SlopViolation[];
  patternsTriggered: number;
};

export const SLOP_PATTERNS: SlopPattern[] = [
  { id: 1, name: "Significance Inflation", description: "'pivotal moment', 'stands as', 'is a testament'", deduction: 5 },
  { id: 2, name: "Undue Notability Claims", description: "Featured in TechCrunch / Forbes / Wired name-drops", deduction: 4 },
  { id: 3, name: "Superficial -ing Phrases", description: "highlighting / showcasing / underscoring", deduction: 3 },
  { id: 4, name: "Promotional Language", description: "boasts / vibrant / profound / commitment to", deduction: 5 },
  { id: 5, name: "Vague Attributions", description: "Experts believe / Industry reports suggest", deduction: 4 },
  { id: 6, name: "Despite-Challenges Structure", description: "Despite X, continues to Y", deduction: 4 },
  { id: 7, name: "AI Vocabulary Clustering", description: "3+ banned words in one paragraph", deduction: 6 },
  { id: 8, name: "Copula Avoidance", description: "serves as / stands as instead of 'is'", deduction: 3 },
  { id: 9, name: "Negative Parallelism", description: "Not X, it's Y", deduction: 7 },
  { id: 10, name: "Rule-of-Three Forcing", description: "Fast, flexible, and forward-thinking", deduction: 3 },
  { id: 11, name: "Synonym Cycling", description: "approach, methodology, and system", deduction: 3 },
  { id: 12, name: "False Ranges", description: "from good to excellent", deduction: 2 },
  { id: 13, name: "Em Dash Overuse", description: ">1 em dash per 200 words", deduction: 2 },
  { id: 14, name: "Mechanical Boldface", description: "arbitrary **bold** emphasis", deduction: 2 },
  { id: 15, name: "Inline-Header Vertical Lists", description: "**Label:** explanation pattern", deduction: 3 },
  { id: 16, name: "Title Case In Every Heading", description: "Why This Approach Works", deduction: 2 },
  { id: 17, name: "Emoji Decoration", description: "emoji on headings or bullets", deduction: 2 },
  { id: 18, name: "Curly Quotation Marks", description: "smart quotes instead of straight", deduction: 1 },
  { id: 19, name: "Collaborative Artifacts", description: "Let me know / happy to discuss", deduction: 4 },
  { id: 20, name: "Knowledge-Cutoff Disclaimers", description: "As of my last training / cutoff", deduction: 5 },
  { id: 21, name: "Sycophantic Tone", description: "Great question / great point", deduction: 3 },
  { id: 22, name: "Filler Phrases", description: "In order to / It is important to note", deduction: 2 },
  { id: 23, name: "Excessive Hedging", description: "could potentially / might have some", deduction: 3 },
  { id: 24, name: "Generic Positive Conclusions", description: "The future looks bright / Exciting times ahead", deduction: 3 },
];

const PATTERN_BY_ID = new Map(SLOP_PATTERNS.map((p) => [p.id, p]));

const BANNED_AI_WORDS = [
  "leverage", "landscape", "robust", "paradigm", "holistic", "transformative",
  "ecosystem", "synergy", "innovative", "cutting-edge", "best-in-class",
  "seamless", "scalable", "mission-critical", "world-class",
];

function snippet(s: string, around: string, len = 80): string {
  const idx = s.toLowerCase().indexOf(around.toLowerCase());
  if (idx < 0) return around;
  const start = Math.max(0, idx - 20);
  const end = Math.min(s.length, idx + around.length + len);
  return (start > 0 ? "…" : "") + s.slice(start, end) + (end < s.length ? "…" : "");
}

function regexHits(
  text: string,
  rx: RegExp,
  patternId: number,
  cap = 5,
): SlopViolation[] {
  const p = PATTERN_BY_ID.get(patternId)!;
  const out: SlopViolation[] = [];
  let m: RegExpExecArray | null;
  let seen = 0;
  rx.lastIndex = 0;
  while ((m = rx.exec(text)) !== null) {
    if (++seen > cap) break;
    out.push({
      patternId,
      patternName: p.name,
      deduction: p.deduction,
      excerpt: snippet(text, m[0]),
    });
    if (!rx.global) break;
  }
  return out;
}

export function scoreContent(rawText: string): SlopReport {
  const text = rawText ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const all: SlopViolation[] = [];

  // 1 — Significance Inflation
  all.push(...regexHits(text, /\b(pivotal moment|stands as|is a testament|defining moment|game[- ]changing|watershed)\b/gi, 1));

  // 2 — Undue Notability Claims
  all.push(...regexHits(text, /\bfeatured in (TechCrunch|Forbes|Wired|Bloomberg|Reuters|Fortune)\b/gi, 2));

  // 3 — Superficial -ing Phrases
  all.push(...regexHits(text, /\b(highlighting|showcasing|underscoring|emphasizing|illustrating) (the|how|that|why)\b/gi, 3));

  // 4 — Promotional Language
  all.push(...regexHits(text, /\b(boasts?|vibrant|profound|commitment to|dedicated to delivering|striving to)\b/gi, 4));

  // 5 — Vague Attributions
  all.push(...regexHits(text, /\b(experts believe|industry reports? suggest|studies show that|research indicates|many believe)\b/gi, 5));

  // 6 — Despite-Challenges Structure
  all.push(...regexHits(text, /\bdespite (challenges|headwinds|setbacks|obstacles|difficulties)[^.]{0,80}(continues? to|remains? committed|persists?)\b/gi, 6));

  // 7 — AI Vocabulary Clustering (3+ banned in one paragraph)
  const paragraphs = text.split(/\n{2,}/);
  for (const para of paragraphs) {
    const lc = para.toLowerCase();
    let n = 0;
    const found: string[] = [];
    for (const w of BANNED_AI_WORDS) {
      if (lc.includes(w)) {
        n++;
        found.push(w);
      }
    }
    if (n >= 3) {
      all.push({
        patternId: 7,
        patternName: "AI Vocabulary Clustering",
        deduction: 6,
        excerpt: `paragraph has ${n} banned words: ${found.slice(0, 5).join(", ")}`,
      });
    }
  }

  // 8 — Copula Avoidance
  all.push(...regexHits(text, /\b(serves as|stands as|functions as|operates as|acts as) (a|an|the)\b/gi, 8));

  // 9 — Negative Parallelism
  all.push(...regexHits(text, /\b(it'?s|this is|that'?s) not (a|just|merely|simply|only)[^.]{1,60}\bit'?s\b/gi, 9));

  // 10 — Rule-of-Three Forcing (adj, adj, and adj)
  all.push(...regexHits(text, /\b(\w+),\s+(\w+),\s+and\s+(\w+)\b/g, 10, 3));

  // 11 — Synonym Cycling
  all.push(...regexHits(text, /\b(approach|methodology|process|system|framework|model)s?,\s+(approach|methodology|process|system|framework|model)s?\b/gi, 11));

  // 12 — False Ranges
  all.push(...regexHits(text, /\bfrom (good|small|simple|basic) to (excellent|great|complex|advanced|sophisticated)\b/gi, 12));

  // 13 — Em Dash Overuse (>1 per 200 words)
  const emDashes = (text.match(/—/g) ?? []).length;
  if (wordCount > 0) {
    const per200 = emDashes / (wordCount / 200);
    if (per200 > 1) {
      all.push({
        patternId: 13,
        patternName: "Em Dash Overuse",
        deduction: 2,
        excerpt: `${emDashes} em dashes across ${wordCount} words (${per200.toFixed(1)} per 200)`,
      });
    }
  }

  // 14 — Mechanical Boldface — bold inside prose, not at line start
  const boldInProse = text.match(/[a-z]\s+\*\*[^*\n]{2,30}\*\*/gi) ?? [];
  if (boldInProse.length >= 3) {
    all.push({
      patternId: 14,
      patternName: "Mechanical Boldface",
      deduction: 2,
      excerpt: `${boldInProse.length} bolded phrases mid-sentence`,
    });
  }

  // 15 — Inline-Header Vertical Lists (**Label:** explanation)
  const inlineHdrs = text.match(/^\s*[-*]?\s*\*\*[^*\n]{1,40}\*\*:\s+/gm) ?? [];
  if (inlineHdrs.length >= 2) {
    all.push({
      patternId: 15,
      patternName: "Inline-Header Vertical Lists",
      deduction: 3,
      excerpt: `${inlineHdrs.length} **Label:** list items`,
    });
  }

  // 16 — Title Case In Every Heading
  const headings = text.match(/^#{1,6}\s+(.+)$/gm) ?? [];
  if (headings.length >= 2) {
    let titleCased = 0;
    for (const h of headings) {
      const words = h.replace(/^#+\s+/, "").split(/\s+/).filter((w) => w.length > 3);
      if (words.length >= 3 && words.every((w) => /^[A-Z]/.test(w))) {
        titleCased++;
      }
    }
    if (titleCased >= 2 && titleCased / headings.length > 0.5) {
      all.push({
        patternId: 16,
        patternName: "Title Case In Every Heading",
        deduction: 2,
        excerpt: `${titleCased} of ${headings.length} headings use Title Case`,
      });
    }
  }

  // 17 — Emoji Decoration
  // eslint-disable-next-line no-misleading-character-class
  const emojiRx = /^(?:#+\s*|[-*]\s*)(?:[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}])/gmu;
  const emojiHits = text.match(emojiRx) ?? [];
  if (emojiHits.length > 0) {
    all.push({
      patternId: 17,
      patternName: "Emoji Decoration",
      deduction: 2,
      excerpt: `${emojiHits.length} headings or bullets start with an emoji`,
    });
  }

  // 18 — Curly Quotes
  if (/[“”‘’]/.test(text)) {
    const count = (text.match(/[“”‘’]/g) ?? []).length;
    all.push({
      patternId: 18,
      patternName: "Curly Quotation Marks",
      deduction: 1,
      excerpt: `${count} curly quote characters detected`,
    });
  }

  // 19 — Collaborative Artifacts
  all.push(...regexHits(text, /\b(let me know if|happy to discuss|hope this helps|feel free to|please don'?t hesitate)\b/gi, 19));

  // 20 — Knowledge-Cutoff Disclaimers
  all.push(...regexHits(text, /\b(as of (my|the) (last |knowledge )?(training|cutoff|update)|i (don'?t have|cannot) access)\b/gi, 20));

  // 21 — Sycophantic Tone
  all.push(...regexHits(text, /\b(great (question|point|insight|observation)|excellent (question|point)|that'?s a great)\b/gi, 21));

  // 22 — Filler Phrases
  all.push(...regexHits(text, /\b(in order to|it is important to note that|it should be noted that|needless to say|at the end of the day)\b/gi, 22));

  // 23 — Excessive Hedging
  all.push(...regexHits(text, /\b(could potentially|might (have some|potentially)|may have some|perhaps somewhat|kind of|sort of)\b/gi, 23));

  // 24 — Generic Positive Conclusions
  all.push(...regexHits(text, /\b(the future looks (bright|promising)|exciting times ahead|sky'?s the limit|only time will tell|onwards and upwards)\b/gi, 24));

  // Deduplicate exact same excerpt for a pattern
  const seen = new Set<string>();
  const violations: SlopViolation[] = [];
  for (const v of all) {
    const key = `${v.patternId}::${v.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(v);
  }

  // Cap deduction per pattern at 3× its weight so a single bad habit
  // doesn't tank the entire score.
  const perPatternCount = new Map<number, number>();
  let totalDeductions = 0;
  for (const v of violations) {
    const n = (perPatternCount.get(v.patternId) ?? 0) + 1;
    perPatternCount.set(v.patternId, n);
    if (n <= 3) totalDeductions += v.deduction;
  }

  const score = Math.max(0, 100 - totalDeductions);
  const patternsTriggered = perPatternCount.size;

  let verdict: SlopReport["verdict"];
  let verdictLabel: string;
  if (score >= 90) {
    verdict = "ship";
    verdictLabel = "Human-sounding. Clean. Ship it.";
  } else if (score >= 70) {
    verdict = "minor";
    verdictLabel = "Minor AI tells. Quick fixes needed.";
  } else if (score >= 50) {
    verdict = "significant";
    verdictLabel = "Obvious AI patterns. Significant rewrite needed.";
  } else {
    verdict = "full_rewrite";
    verdictLabel = "Full rewrite required.";
  }

  return {
    score,
    verdict,
    verdictLabel,
    totalDeductions,
    wordCount,
    violations,
    patternsTriggered,
  };
}
