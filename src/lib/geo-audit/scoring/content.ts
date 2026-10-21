import { load, thresholds, weights } from "@/lib/geo-audit/data";
import {
  contentChars,
  proseBlocks,
  type GeoDocument,
} from "@/lib/geo-audit/lib/extract";
import { exempt } from "@/lib/geo-audit/scoring/articles";
import { nodesOf, typesIn } from "@/lib/geo-audit/scoring/schema-org";
import { buildSignal, ramp, ADVISORY, type Signal } from "@/lib/geo-audit/scoring/model";
import type { GeoPage } from "@/lib/geo-audit/scoring/technical";

const SENTENCE_END = /(?<=[.!?])\s+/;
const DATE_META = [
  "article:modified_time",
  "datemodified",
  "article:published_time",
  "datepublished",
] as const;
const REFERENCE = new Set(["@id", "@type", "@context"]);

function config(section: string): Record<string, number> {
  return (thresholds("content") as Record<string, Record<string, number>>)[section]!;
}

export function depth(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const cfg = config("depth");
  const chars = contentChars(doc);
  const sections = new Set(
    doc.blocks.filter((b) => b.section >= 0).map((b) => b.section),
  ).size;

  const volume = 15 * Math.min(chars / cfg.good_chars!, 1);
  const structure = 6 * Math.min(sections / cfg.good_sections!, 1);
  const media = doc.lists || doc.tables ? 4 : 0;

  let points = volume + structure + media;
  const thin = chars < cfg.min_chars!;
  if (thin) points = Math.min(points, 6);

  return [
    points,
    {
      content_chars: chars,
      sections,
      lists: doc.lists,
      tables: doc.tables,
      thin,
      min_chars: cfg.min_chars,
      breakdown: {
        volume: Math.round(volume * 100) / 100,
        structure: Math.round(structure * 100) / 100,
        media,
      },
    },
  ];
}

function types(node: Record<string, unknown>): Set<string> {
  const kind = node["@type"];
  if (typeof kind === "string") return new Set([kind]);
  if (Array.isArray(kind)) return new Set(kind.map(String));
  return new Set();
}

function author(doc: GeoDocument): Record<string, unknown> | null {
  const articleTypes = new Set(
    (load("schema_requirements") as { article_types: string[] }).article_types,
  );
  const byId = new Map<string, Record<string, unknown>>();
  const articlesFirst: Record<string, unknown>[] = [];

  const walk = (node: unknown, depth = 0) => {
    if (depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record["@id"] === "string") {
      const keys = new Set(Object.keys(record));
      for (const r of REFERENCE) keys.delete(r);
      if (keys.size) byId.set(record["@id"] as string, record);
    }
    if ([...types(record)].some((t) => articleTypes.has(t))) {
      articlesFirst.push(record);
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "@type") walk(child, depth + 1);
    }
  };

  for (const entry of doc.jsonld) walk(entry);

  const personIn = (value: unknown): Record<string, unknown> | null => {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      let record = item as Record<string, unknown>;
      const keys = new Set(Object.keys(record));
      for (const r of REFERENCE) keys.delete(r);
      if (!keys.size) {
        const id = record["@id"];
        if (typeof id === "string") record = byId.get(id) ?? record;
      }
      if (types(record).has("Person")) return record;
    }
    return null;
  };

  const declared: Record<string, unknown>[] = [];
  for (const entry of doc.jsonld) {
    const nodes = Array.isArray(entry) ? entry : [entry];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      declared.push(record);
      const graph = record["@graph"];
      if (Array.isArray(graph)) {
        for (const member of graph) {
          if (member && typeof member === "object") {
            declared.push(member as Record<string, unknown>);
          }
        }
      }
    }
  }

  for (const node of [...articlesFirst, ...declared]) {
    const found = personIn(node.author);
    if (found) return found;
  }
  return declared.find((node) => types(node).has("Person")) ?? null;
}

export function expertise(
  doc: GeoDocument,
  siteMarksArticles = false,
): [number | null, Record<string, unknown>] {
  const ex = exempt(doc, siteMarksArticles);
  if (ex) return ex;
  const person = author(doc);
  const byline = doc.meta.author;

  const has = {
    byline: Boolean(byline) || Boolean(person?.name),
    person_schema: person !== null,
    credentials: Boolean(person?.jobTitle || person?.description),
    author_profile: Boolean(person?.url || person?.sameAs),
    organization: ["Organization", "NewsMediaOrganization"].some((t) => typesIn(doc).has(t)),
  };
  const w = {
    byline: 7,
    person_schema: 6,
    credentials: 5,
    author_profile: 4,
    organization: 3,
  };
  const points = Object.entries(has)
    .filter(([, present]) => present)
    .reduce((sum, [key]) => sum + w[key as keyof typeof w], 0);

  return [
    points,
    {
      present: Object.keys(has).filter((k) => has[k as keyof typeof has]).sort(),
      missing: Object.keys(has).filter((k) => !has[k as keyof typeof has]).sort(),
      byline: byline ?? person?.name ?? null,
      points_table: w,
    },
  ];
}

function parseDate(value: string): Date | null {
  const text = (value ?? "").trim();
  for (const candidate of [text, text.replace(/Z$/, "+00:00")]) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  return null;
}

export function freshness(
  doc: GeoDocument,
  now = new Date(),
): [number | null, Record<string, unknown>] {
  const cfg = config("freshness");
  const found: Record<string, string> = {};
  for (const key of DATE_META) {
    const value = doc.meta[key];
    if (value) found[key] = value;
  }
  for (const node of nodesOf(doc, new Set(["Article", "BlogPosting", "NewsArticle", "WebPage"]))) {
    for (const key of ["dateModified", "datePublished"] as const) {
      if (node[key]) found[key] ??= String(node[key]);
    }
  }

  const modified =
    found["article:modified_time"] ??
    found.dateModified ??
    found.datemodified;
  const published =
    found["article:published_time"] ??
    found.datePublished ??
    found.datepublished;

  if (!modified && !published) {
    return [0, { reason: "no date on the page", dates_found: [] }];
  }

  const best = parseDate(modified ?? published ?? "");
  if (!best) {
    return [
      8,
      {
        reason: "a date is present but could not be parsed",
        dates_found: Object.keys(found).sort(),
      },
    ];
  }

  const ageDays = Math.max(
    Math.floor((now.getTime() - best.getTime()) / 86_400_000),
    0,
  );
  const recency = 17 * (1 - ramp(ageDays, cfg.fresh_days!, cfg.stale_days!));
  const hasModified = modified ? 8 : 0;
  return [
    recency + hasModified,
    {
      age_days: ageDays,
      modified: modified ?? null,
      published: published ?? null,
      dates_found: Object.keys(found).sort(),
      fresh_days: cfg.fresh_days,
      stale_days: cfg.stale_days,
      breakdown: {
        recency: Math.round(recency * 100) / 100,
        has_modified_date: hasModified,
      },
    },
  ];
}

export function readability(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const cfg = config("readability");
  const sentences: number[] = [];
  for (const block of proseBlocks(doc)) {
    for (const sentence of block.text.split(SENTENCE_END)) {
      const words = sentence.split(/\s+/).filter(Boolean).length;
      if (words >= 3) sentences.push(words);
    }
  }

  if (!sentences.length) {
    return [0, { reason: "no prose to measure", sentences: 0 }];
  }

  const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
  const longSentences = sentences.filter((c) => c > cfg.long_sentence_words!);
  const longShare = longSentences.length / sentences.length;

  const meanPoints = 15 * (1 - ramp(mean, cfg.good_mean_words!, cfg.poor_mean_words!));
  const sharePoints = 10 * (1 - ramp(longShare, cfg.good_long_share!, 0.35));
  return [
    meanPoints + sharePoints,
    {
      sentences: sentences.length,
      mean_words: Math.round(mean * 10) / 10,
      longest: Math.max(...sentences),
      long_sentences: longSentences.length,
      long_share: Math.round(longShare * 1000) / 1000,
      thresholds: {
        good_mean_words: cfg.good_mean_words,
        long_sentence_words: cfg.long_sentence_words,
      },
    },
  ];
}

export function advisorySignals(): Signal[] {
  const contentWeights = weights().content as {
    advisory?: Record<string, { question: string; rubric: string }>;
  };
  const declared = (contentWeights.advisory ?? {}) as Record<
    string,
    { question: string; rubric: string }
  >;
  return Object.entries(declared).map(([signalId, spec]) => ({
    id: signalId,
    cls: ADVISORY,
    max: 0,
    value: null,
    detail: {
      question: spec.question,
      rubric: spec.rubric,
      answered_by: "model",
      enters_score: false,
    },
    skippedReason: "advisory: answered by the model, never scored",
  }));
}

export function scoreContent(
  page: GeoPage,
  opts: { now?: Date; siteMarksArticles?: boolean } = {},
): Signal[] {
  const spec = weights().content!.signals;
  const doc = page.doc;
  const url = page.result?.finalUrl ?? page.url;
  const siteMarks = opts.siteMarksArticles ?? false;
  const unmeasured: [null, Record<string, unknown>] = [
    null,
    { reason: "the page returned no markup to inspect" },
  ];

  if (!doc) {
    return Object.keys(spec).map((signalId) =>
      buildSignal(signalId, spec[signalId]!, unmeasured, url),
    );
  }

  const now = opts.now ?? new Date();
  return [
    buildSignal("content.depth", spec["content.depth"]!, depth(doc), url),
    buildSignal("content.expertise", spec["content.expertise"]!, expertise(doc, siteMarks), url),
    buildSignal("content.freshness", spec["content.freshness"]!, freshness(doc, now), url),
    buildSignal("content.readability", spec["content.readability"]!, readability(doc), url),
  ];
}
