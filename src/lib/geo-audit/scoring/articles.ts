import { load, thresholds } from "@/lib/geo-audit/data";
import type { GeoDocument } from "@/lib/geo-audit/lib/extract";
import { NOT_APPLICABLE } from "@/lib/geo-audit/scoring/model";

export const ARTICLES_ONLY = `${NOT_APPLICABLE}: articles only`;

const HOME = /^\/?(?:[a-z]{2}(?:[-_][a-z]{2,4})?\/?)?$/i;

const ARCHIVE =
  /.*\/(?:[^/]+-)?(category|categories|kategorie|kategorien|tag|tags|author|authors)\/[^/]+(?:\/page\/\d+)?\/?$/i;

const ARCHIVE_OF: Record<string, string> = {
  categor: "a category",
  kategor: "a category",
  tag: "a tag",
  author: "an author",
};

const MARKED_MIN_PAGES = 2;

export function declaredTypes(doc: GeoDocument): Set<string> {
  const found = new Set<string>();
  for (const entry of doc.jsonld) {
    const nodes = Array.isArray(entry) ? entry : [entry];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      const members = record["@graph"];
      const list = [
        record,
        ...(Array.isArray(members) ? members : []),
      ] as Record<string, unknown>[];
      for (const member of list) {
        const kind = member["@type"];
        if (typeof kind === "string") found.add(kind);
        else if (Array.isArray(kind)) {
          for (const k of kind) found.add(String(k));
        }
      }
    }
  }
  return found;
}

export function marksAnArticle(doc: GeoDocument): boolean {
  const articleTypes = load("schema_requirements") as { article_types: string[] };
  if ([...declaredTypes(doc)].some((t) => articleTypes.article_types.includes(t))) {
    return true;
  }
  return (doc.meta["og:type"] ?? "").trim().toLowerCase() === "article";
}

export function marksItsArticles(docs: GeoDocument[]): boolean {
  let marked = 0;
  for (const doc of docs) {
    if (marksAnArticle(doc)) marked += 1;
    if (marked >= MARKED_MIN_PAGES) return true;
  }
  return false;
}

export function notAnArticle(
  doc: GeoDocument,
  siteMarksArticles = false,
): string | null {
  const path = new URL(doc.url).pathname;
  if (HOME.test(path)) return "the site's home page";

  const declared = declaredTypes(doc);
  const requirements = load("schema_requirements") as {
    article_types: string[];
    not_article_types: string[];
  };
  if (requirements.article_types.some((t) => declared.has(t))) {
    return null;
  }

  const beneath = `${path.replace(/\/$/, "")}/`;
  const children = new Set<string>();
  for (const link of doc.internalLinks) {
    try {
      const linkPath = new URL(link).pathname.replace(/\/$/, "");
      const selfPath = path.replace(/\/$/, "");
      if (linkPath.startsWith(beneath) && linkPath !== selfPath) {
        children.add(linkPath);
      }
    } catch {
      /* skip */
    }
  }
  const indexMin = (thresholds("articles") as { index_min_children: number })
    .index_min_children;
  if (children.size >= indexMin) {
    return `an index of ${children.size} pages beneath it`;
  }

  const archive = ARCHIVE.exec(path);
  if (archive) {
    const stem = archive[1]!.toLowerCase();
    const kind =
      Object.entries(ARCHIVE_OF).find(([k]) => stem.startsWith(k))?.[1] ??
      "an archive";
    return `${kind} archive`;
  }

  for (const kind of requirements.not_article_types) {
    if (declared.has(kind)) return `declared a ${kind}`;
  }

  const ogType = (doc.meta["og:type"] ?? "").trim().toLowerCase();
  if (ogType.startsWith("product") || ogType === "profile") {
    return `declared og:type ${ogType}`;
  }

  if (siteMarksArticles && !marksAnArticle(doc)) {
    return "the site marks its articles and not this page";
  }
  return null;
}

export function exempt(
  doc: GeoDocument,
  siteMarksArticles = false,
): [null, Record<string, unknown>] | null {
  const reason = notAnArticle(doc, siteMarksArticles);
  if (reason === null) return null;
  return [null, { reason: ARTICLES_ONLY, not_an_article: reason }];
}
