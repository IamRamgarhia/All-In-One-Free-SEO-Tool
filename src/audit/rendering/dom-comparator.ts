import * as cheerio from "cheerio";

export type DomDiff = {
  rawTitle: string | null;
  renderedTitle: string | null;
  titleChanged: boolean;
  rawH1: string | null;
  renderedH1: string | null;
  h1Changed: boolean;
  rawDescription: string | null;
  renderedDescription: string | null;
  descriptionChanged: boolean;
  rawCanonical: string | null;
  renderedCanonical: string | null;
  canonicalChanged: boolean;
  rawWordCount: number;
  renderedWordCount: number;
  contentAppearsOnlyAfterJs: boolean;
  rawLinkCount: number;
  renderedLinkCount: number;
};

function metaDesc($: cheerio.CheerioAPI): string | null {
  return (
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[name="Description"]').attr("content")?.trim() ||
    null
  );
}

function wordCount($: cheerio.CheerioAPI): number {
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

export function compareRawVsRendered(
  rawHtml: string,
  renderedHtml: string,
): DomDiff {
  const $raw = cheerio.load(rawHtml || "<html></html>");
  const $ren = cheerio.load(renderedHtml || "<html></html>");

  const rawTitle = $raw("head > title").first().text().trim() || null;
  const renderedTitle = $ren("head > title").first().text().trim() || null;
  const rawH1 = $raw("h1").first().text().trim() || null;
  const renderedH1 = $ren("h1").first().text().trim() || null;
  const rawDescription = metaDesc($raw);
  const renderedDescription = metaDesc($ren);
  const rawCanonical = $raw('link[rel="canonical"]').first().attr("href")?.trim() || null;
  const renderedCanonical =
    $ren('link[rel="canonical"]').first().attr("href")?.trim() || null;
  const rawWordCount = wordCount($raw);
  const renderedWordCount = wordCount($ren);

  return {
    rawTitle,
    renderedTitle,
    titleChanged: (rawTitle ?? "") !== (renderedTitle ?? ""),
    rawH1,
    renderedH1,
    h1Changed: (rawH1 ?? "") !== (renderedH1 ?? ""),
    rawDescription,
    renderedDescription,
    descriptionChanged: (rawDescription ?? "") !== (renderedDescription ?? ""),
    rawCanonical,
    renderedCanonical,
    canonicalChanged: (rawCanonical ?? "") !== (renderedCanonical ?? ""),
    rawWordCount,
    renderedWordCount,
    contentAppearsOnlyAfterJs: rawWordCount < 20 && renderedWordCount >= 50,
    rawLinkCount: $raw("a[href]").length,
    renderedLinkCount: $ren("a[href]").length,
  };
}
