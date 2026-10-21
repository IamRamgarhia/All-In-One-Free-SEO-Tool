import { thresholds, weights } from "@/lib/geo-audit/data";
import {
  contentChars,
  excerpt,
  type Block,
  type GeoDocument,
  proseBlocks,
} from "@/lib/geo-audit/lib/extract";
import { exempt } from "@/lib/geo-audit/scoring/articles";
import { buildSignal, ramp } from "@/lib/geo-audit/scoring/model";
import type { Signal } from "@/lib/geo-audit/scoring/model";

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";

const FACT_MARKER = new RegExp(
  String.raw`\b\d{2,}\b` +
    String.raw`|\b\d+(?:\.\d+)?\s?(?:%|percent|ms|s|kb|mb|gb|tb|km|kg|lb|hours?|minutes?|days?|weeks?|months?|years?|x)\b` +
    String.raw`|[$€£]\s?\d` +
    String.raw`|\b(?:19|20)\d{2}\b` +
    `|\\b(?:${MONTHS})\\b`,
  "i",
);

const SENTENCE_END = /(?<=[.!?])\s+/;

export function firstSentence(text: string): string {
  const parts = text.trim().split(SENTENCE_END);
  return parts[0] ?? text;
}

function openerPatterns(openers: string[]): RegExp {
  const alternatives = [...openers]
    .sort((a, b) => b.length - a.length)
    .map((o) => o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`^(?:${alternatives})\\b`, "i");
}

function startsWith(pattern: RegExp, text: string): boolean {
  return pattern.test(text.replace(/^["'“‘\s]+/, ""));
}

export function selfContainment(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const config = thresholds("self_containment") as {
    dangling_openers: string[];
    min_block_words: number;
    floor_ratio: number;
    good_ratio: number;
  };
  const pattern = openerPatterns(config.dangling_openers);
  const candidates = proseBlocks(doc).filter((b) => b.words >= config.min_block_words);

  if (!candidates.length) {
    return [
      0,
      {
        reason: "no extractable blocks",
        candidate_blocks: 0,
        self_contained: 0,
        ratio: 0,
      },
    ];
  }

  const dangling = candidates.filter((b) => startsWith(pattern, b.text));
  const contained = candidates.length - dangling.length;
  const ratio = contained / candidates.length;
  const points = 25 * ramp(ratio, config.floor_ratio, config.good_ratio);
  const detail: Record<string, unknown> = {
    candidate_blocks: candidates.length,
    self_contained: contained,
    ratio: Math.round(ratio * 1000) / 1000,
    floor_ratio: config.floor_ratio,
    good_ratio: config.good_ratio,
  };
  if (dangling.length) {
    detail.worst_example = excerpt(dangling[0]!.text);
    detail.dangling_blocks = dangling.length;
  }
  return [points, detail];
}

function sections(doc: GeoDocument): Array<[string, Block | null]> {
  const out: Array<[string, Block | null]> = [];
  let heading: string | null = null;
  let lead: Block | null = null;
  for (const block of doc.blocks) {
    if (block.kind === "h2" || block.kind === "h3") {
      if (heading !== null) out.push([heading, lead]);
      heading = block.text;
      lead = null;
    } else if (
      heading !== null &&
      lead === null &&
      ["p", "li", "blockquote"].includes(block.kind)
    ) {
      lead = block;
    }
  }
  if (heading !== null) out.push([heading, lead]);
  return out;
}

export function answerFirst(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const config = thresholds("answer_first") as {
    filler_openers: string[];
    max_lead_words: number;
    floor_ratio: number;
    good_ratio: number;
  };
  const pattern = openerPatterns(config.filler_openers);
  const sects = sections(doc).filter(([, lead]) => lead !== null) as Array<
    [string, Block]
  >;

  if (!sects.length) {
    return [
      0,
      {
        reason: "no headed sections with body text",
        sections: 0,
        answer_first: 0,
        ratio: 0,
      },
    ];
  }

  const passing: Array<[string, Block]> = [];
  const failing: Array<[string, Block]> = [];
  for (const [heading, lead] of sects) {
    const leadSentence = firstSentence(lead.text);
    const ok =
      !startsWith(pattern, lead.text) &&
      leadSentence.split(/\s+/).length <= config.max_lead_words;
    (ok ? passing : failing).push([heading, lead]);
  }

  const ratio = passing.length / sects.length;
  const points = 20 * ramp(ratio, config.floor_ratio, config.good_ratio);
  const detail: Record<string, unknown> = {
    sections: sects.length,
    answer_first: passing.length,
    ratio: Math.round(ratio * 1000) / 1000,
    max_lead_words: config.max_lead_words,
  };
  if (failing.length) {
    detail.worst_example = excerpt(failing[0]![1].text);
    detail.worst_section = excerpt(failing[0]![0], 80);
  }
  return [points, detail];
}

export function structure(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const config = thresholds("structure") as { min_h2: number; max_section_words: number };
  const levels = doc.headings.map(([level]) => level);
  const h1 = levels.filter((l) => l === 1).length;
  const h2 = levels.filter((l) => l === 2).length;

  const h1Points = h1 === 1 ? 4 : 0;
  const h2Points = config.min_h2 ? 4 * Math.min(h2 / config.min_h2, 1) : 4;

  let skipped = 0;
  let previous = 0;
  for (const level of levels) {
    if (previous && level > previous + 1) skipped += 1;
    previous = level;
  }
  const skipPoints = !levels.length ? 0 : skipped === 0 ? 3 : Math.max(0, 3 - skipped);

  const sectionWords = new Map<number, number>();
  for (const block of doc.blocks) {
    if (block.section >= 0 && ["p", "li", "blockquote", "dd"].includes(block.kind)) {
      sectionWords.set(block.section, (sectionWords.get(block.section) ?? 0) + block.words);
    }
  }
  const oversized = [...sectionWords.entries()].filter(
    ([, words]) => words > config.max_section_words,
  );
  const lengthPoints = sectionWords.size
    ? 4 * (1 - oversized.length / sectionWords.size)
    : 0;

  const points = h1Points + h2Points + skipPoints + lengthPoints;
  return [
    points,
    {
      h1,
      h2,
      headings: levels.length,
      skipped_levels: skipped,
      sections: sectionWords.size,
      oversized_sections: oversized.length,
      max_section_words: config.max_section_words,
      breakdown: {
        single_h1: Math.round(h1Points * 100) / 100,
        enough_h2: Math.round(h2Points * 100) / 100,
        no_skipped_levels: Math.round(skipPoints * 100) / 100,
        section_length: Math.round(lengthPoints * 100) / 100,
      },
    },
  ];
}

export function evidenceDensity(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const config = thresholds("evidence_density") as {
    floor_ratio: number;
    good_ratio: number;
    good_external_domains: number;
  };
  const blocks = proseBlocks(doc);
  if (!blocks.length) {
    return [0, { reason: "no extractable blocks", ratio: 0, external_domains: 0 }];
  }

  const withFacts = blocks.filter((b) => FACT_MARKER.test(b.text));
  const ratio = withFacts.length / blocks.length;
  const domains = [
    ...new Set(
      doc.externalLinks
        .map((u) => {
          try {
            return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
          } catch {
            return "";
          }
        })
        .filter(Boolean),
    ),
  ].sort();

  const factPoints = 10 * ramp(ratio, config.floor_ratio, config.good_ratio);
  const linkPoints = 5 * Math.min(domains.length / config.good_external_domains, 1);

  const detail: Record<string, unknown> = {
    prose_blocks: blocks.length,
    blocks_with_facts: withFacts.length,
    ratio: Math.round(ratio * 1000) / 1000,
    external_domains: domains.length,
    breakdown: {
      facts: Math.round(factPoints * 100) / 100,
      outbound_citations: Math.round(linkPoints * 100) / 100,
    },
  };
  const barren = blocks.filter((b) => !FACT_MARKER.test(b.text) && b.words >= 25);
  if (barren.length) detail.worst_example = excerpt(barren[0]!.text);
  return [factPoints + linkPoints, detail];
}

export function extractability(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const config = thresholds("extractability") as {
    empty_framework_root_chars: number;
    min_content_chars: number;
    good_content_chars: number;
    good_content_ratio: number;
    structured_bonus_lists: number;
    structured_bonus_tables: number;
  };
  const chars = contentChars(doc);
  const ratio = doc.bodyChars ? chars / doc.bodyChars : 0;
  const emptyMount =
    doc.frameworkRootChars !== null &&
    doc.frameworkRootChars < config.empty_framework_root_chars;
  const gated =
    emptyMount ||
    (doc.jsRequiredNotice && chars < config.min_content_chars);

  let points = 15;
  if (gated) {
    const volumePoints = 8 * Math.min(chars / config.good_content_chars, 1);
    const ratioPoints = 4 * Math.min(ratio / config.good_content_ratio, 1);
    let structured = 0;
    if (doc.lists >= config.structured_bonus_lists) structured += 2;
    if (doc.tables >= config.structured_bonus_tables) structured += 1;
    points = Math.min(volumePoints + ratioPoints + structured, 3);
  }

  return [
    points,
    {
      content_chars: chars,
      body_chars: doc.bodyChars,
      content_ratio: Math.round(ratio * 1000) / 1000,
      content_root: doc.contentRoot,
      lists: doc.lists,
      tables: doc.tables,
      js_required_notice: doc.jsRequiredNotice,
      framework_root_chars: doc.frameworkRootChars,
      empty_framework_root: emptyMount,
      js_gated: gated,
      min_content_chars: config.min_content_chars,
    },
  ];
}

function jsonldTypes(doc: GeoDocument): Set<string> {
  const types = new Set<string>();
  const walk = (node: unknown, depth = 0) => {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const value = record["@type"];
    if (typeof value === "string") types.add(value);
    else if (Array.isArray(value)) {
      for (const v of value) types.add(String(v));
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "@type") walk(child, depth + 1);
    }
  };
  for (const entry of doc.jsonld) walk(entry);
  return types;
}

function jsonldHas(doc: GeoDocument, key: string): boolean {
  return doc.jsonld.some((node) => key in node);
}

export function attribution(
  doc: GeoDocument,
  siteMarksArticles = false,
): [number | null, Record<string, unknown>] {
  const ex = exempt(doc, siteMarksArticles);
  if (ex) return ex;
  const pointsTable = (thresholds("attribution") as { points: Record<string, number> })
    .points;
  const types = jsonldTypes(doc);

  const found = {
    byline: Boolean(doc.meta.author) || jsonldHas(doc, "author"),
    published_date:
      Boolean(doc.meta["article:published_time"] || doc.meta.datepublished) ||
      jsonldHas(doc, "datePublished"),
    modified_date:
      Boolean(doc.meta["article:modified_time"] || doc.meta.datemodified) ||
      jsonldHas(doc, "dateModified"),
    organization_schema: ["Organization", "Person", "NewsMediaOrganization"].some((t) =>
      types.has(t),
    ),
    canonical: Boolean(doc.meta.canonical),
  };

  const points = Object.entries(found)
    .filter(([, present]) => present)
    .reduce((sum, [key]) => sum + (pointsTable[key] ?? 0), 0);

  return [
    points,
    {
      present: Object.keys(found).filter((k) => found[k as keyof typeof found]).sort(),
      missing: Object.keys(found).filter((k) => !found[k as keyof typeof found]).sort(),
      jsonld_types: [...types].sort(),
      points_table: pointsTable,
    },
  ];
}

export function renderParity(
  doc: GeoDocument,
  renderedChars: number | null,
): [number | null, Record<string, unknown>] {
  if (renderedChars === null) {
    return [null, { reason: "browser extra not installed" }];
  }
  if (renderedChars <= 0) {
    return [0, { rendered_chars: 0, static_chars: contentChars(doc), ratio: 0 }];
  }
  const config = thresholds("render_parity") as { floor_ratio: number; good_ratio: number };
  const ratio = Math.min(contentChars(doc) / renderedChars, 1);
  const points = 10 * ramp(ratio, config.floor_ratio, config.good_ratio);
  return [
    points,
    {
      static_chars: contentChars(doc),
      rendered_chars: renderedChars,
      ratio: Math.round(ratio * 1000) / 1000,
      floor_ratio: config.floor_ratio,
      good_ratio: config.good_ratio,
    },
  ];
}

export function scoreCitability(
  doc: GeoDocument,
  opts: { renderedChars?: number | null; siteMarksArticles?: boolean } = {},
): Signal[] {
  const spec = weights().citability!.signals;
  const page = doc.url;
  const rendered = opts.renderedChars ?? null;
  const siteMarks = opts.siteMarksArticles ?? false;

  return [
    buildSignal("citability.self_containment", spec["citability.self_containment"]!, selfContainment(doc), page),
    buildSignal("citability.answer_first", spec["citability.answer_first"]!, answerFirst(doc), page),
    buildSignal("citability.structure", spec["citability.structure"]!, structure(doc), page),
    buildSignal("citability.evidence_density", spec["citability.evidence_density"]!, evidenceDensity(doc), page),
    buildSignal("citability.extractability", spec["citability.extractability"]!, extractability(doc), page),
    buildSignal("citability.attribution", spec["citability.attribution"]!, attribution(doc, siteMarks), page),
    buildSignal("citability.render_parity", spec["citability.render_parity"]!, renderParity(doc, rendered), page),
  ];
}
