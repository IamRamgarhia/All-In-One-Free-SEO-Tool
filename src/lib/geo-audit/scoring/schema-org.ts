import { load, weights } from "@/lib/geo-audit/data";
import type { GeoDocument } from "@/lib/geo-audit/lib/extract";
import { exempt } from "@/lib/geo-audit/scoring/articles";
import { buildSignal, type Signal } from "@/lib/geo-audit/scoring/model";
import type { GeoPage } from "@/lib/geo-audit/scoring/technical";

function requirements() {
  return load("schema_requirements") as {
    types: Record<string, { required: string[] }>;
    entity_types: string[];
    article_types: string[];
    answer_types: string[];
  };
}

export function typesIn(doc: GeoDocument): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown, depth = 0) => {
    if (depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const value = record["@type"];
    if (typeof value === "string") found.add(value);
    else if (Array.isArray(value)) {
      for (const v of value) found.add(String(v));
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== "@type") walk(child, depth + 1);
    }
  };
  for (const entry of doc.jsonld) walk(entry);
  return found;
}

export function nodesOf(doc: GeoDocument, wanted: Set<string>): Record<string, unknown>[] {
  const matched: Record<string, unknown>[] = [];
  const walk = (node: unknown, depth = 0) => {
    if (depth > 5) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const declared = record["@type"];
    const names = new Set<string>();
    if (typeof declared === "string") names.add(declared);
    else if (Array.isArray(declared)) {
      for (const d of declared) names.add(String(d));
    }
    if ([...names].some((n) => wanted.has(n))) matched.push(record);
    for (const [key, child] of Object.entries(record)) {
      if (key !== "@type") walk(child, depth + 1);
    }
  };
  for (const entry of doc.jsonld) walk(entry);
  return matched;
}

export function presence(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const parsed = doc.jsonld.length;
  const attempted = parsed + doc.jsonldErrors.length;
  const points = attempted ? 30 : 0;
  return [
    points,
    {
      blocks: parsed,
      blocks_attempted: attempted,
      unparseable_blocks: doc.jsonldErrors.length,
      types: [...typesIn(doc)].sort(),
    },
  ];
}

export function validity(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const req = requirements().types;
  if (doc.jsonldErrors.length && !doc.jsonld.length) {
    return [0, { parse_errors: doc.jsonldErrors, checked: 0 }];
  }
  if (!doc.jsonld.length) {
    return [null, { reason: "no structured data to validate", checked: 0 }];
  }

  let checked = 0;
  const missing: string[] = [];
  for (const [typeName, spec] of Object.entries(req)) {
    for (const node of nodesOf(doc, new Set([typeName]))) {
      checked += 1;
      for (const prop of spec.required) {
        if (!(prop in node)) missing.push(`${typeName}.${prop}`);
      }
    }
  }

  if (!checked) {
    const points = doc.jsonldErrors.length ? 5 : 15;
    return [
      points,
      {
        checked: 0,
        reason: "no recognised types to validate",
        parse_errors: doc.jsonldErrors,
      },
    ];
  }

  const ratio = 1 - Math.min(missing.length / checked, 1);
  let points = 25 * ratio;
  if (doc.jsonldErrors.length) points = Math.min(points, 10);
  return [
    points,
    {
      checked,
      missing_required: [...new Set(missing)].sort(),
      parse_errors: doc.jsonldErrors,
    },
  ];
}

export function organization(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const req = requirements();
  const nodes = nodesOf(doc, new Set(req.entity_types));
  if (!nodes.length) {
    return [0, { reason: "no Organization, LocalBusiness or Person node", found: [] }];
  }

  const node = nodes[0]!;
  const has = {
    name: Boolean(node.name),
    url: Boolean(node.url),
    logo: Boolean(node.logo || node.image),
    sameAs: Boolean(node.sameAs),
    description: Boolean(node.description),
  };
  const w = { name: 5, url: 4, logo: 3, sameAs: 5, description: 3 };
  const points = Object.entries(has)
    .filter(([, present]) => present)
    .reduce((sum, [key]) => sum + w[key as keyof typeof w], 0);

  const sameAs = node.sameAs;
  let sameAsCount = 0;
  if (Array.isArray(sameAs)) sameAsCount = sameAs.length;
  else if (sameAs) sameAsCount = 1;

  return [
    points,
    {
      types: [...typesIn(doc)].filter((t) => req.entity_types.includes(t)).sort(),
      present: Object.keys(has).filter((k) => has[k as keyof typeof has]).sort(),
      missing: Object.keys(has).filter((k) => !has[k as keyof typeof has]).sort(),
      same_as_count: sameAsCount,
    },
  ];
}

export function articleSchema(
  doc: GeoDocument,
  siteMarksArticles = false,
): [number | null, Record<string, unknown>] {
  const ex = exempt(doc, siteMarksArticles);
  if (ex) return ex;
  const req = requirements();
  const nodes = nodesOf(doc, new Set(req.article_types));
  if (!nodes.length) {
    return [0, { reason: "no Article-family node", found: [] }];
  }

  const node = nodes[0]!;
  const has = {
    headline: Boolean(node.headline),
    author: Boolean(node.author),
    datePublished: Boolean(node.datePublished),
    dateModified: Boolean(node.dateModified),
    image: Boolean(node.image),
  };
  const w = { headline: 4, author: 4, datePublished: 3, dateModified: 2, image: 2 };
  const points = Object.entries(has)
    .filter(([, present]) => present)
    .reduce((sum, [key]) => sum + w[key as keyof typeof w], 0);

  return [
    points,
    {
      types: [...typesIn(doc)].filter((t) => req.article_types.includes(t)).sort(),
      present: Object.keys(has).filter((k) => has[k as keyof typeof has]).sort(),
      missing: Object.keys(has).filter((k) => !has[k as keyof typeof has]).sort(),
    },
  ];
}

export function breadth(doc: GeoDocument): [number | null, Record<string, unknown>] {
  const answerTypes = new Set(requirements().answer_types);
  const found = [...typesIn(doc)].filter((t) => answerTypes.has(t));
  const points = 10 * Math.min(found.length / 2, 1);
  return [
    points,
    {
      answer_types_found: found.sort(),
      answer_types_known: [...answerTypes].sort(),
      full_marks_at: 2,
    },
  ];
}

export function scoreSchema(
  page: GeoPage,
  siteMarksArticles = false,
): Signal[] {
  const spec = weights().schema!.signals;
  const doc = page.doc;
  const url = page.result?.finalUrl ?? page.url;
  const unmeasured: [null, Record<string, unknown>] = [
    null,
    { reason: "the page returned no markup to inspect" },
  ];

  if (!doc) {
    return Object.keys(spec).map((signalId) =>
      buildSignal(signalId, spec[signalId]!, unmeasured, url),
    );
  }

  return [
    buildSignal("schema.presence", spec["schema.presence"]!, presence(doc), url),
    buildSignal("schema.validity", spec["schema.validity"]!, validity(doc), url),
    buildSignal("schema.organization", spec["schema.organization"]!, organization(doc), url),
    buildSignal("schema.article", spec["schema.article"]!, articleSchema(doc, siteMarksArticles), url),
    buildSignal("schema.breadth", spec["schema.breadth"]!, breadth(doc), url),
  ];
}
