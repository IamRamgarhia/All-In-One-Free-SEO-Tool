"use server";

import { z } from "zod";
import {
  buildSitemapHtml,
  buildSitemapTxt,
  buildSitemapXml,
  crawlSite,
} from "@/lib/sitemap-generator";
import { saveToolRun } from "@/lib/tool-runs";

const schema = z.object({
  url: z
    .string()
    .trim()
    .min(3)
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .pipe(z.string().url()),
  maxPages: z.coerce.number().int().min(10).max(2000).default(300),
  respectRobots: z
    .union([z.literal("on"), z.literal("off"), z.undefined()])
    .transform((v) => v !== "off"),
});

export type SitemapResult =
  | {
      ok: true;
      pageCount: number;
      errorCount: number;
      hostLabel: string;
      xml: string;
      txt: string;
      html: string;
      sample: string[];
    }
  | { ok: false; error: string };

export async function generateSitemap(
  _prev: SitemapResult | null,
  formData: FormData,
): Promise<SitemapResult> {
  const parsed = schema.safeParse({
    url: formData.get("url"),
    maxPages: formData.get("maxPages"),
    respectRobots: formData.get("respectRobots"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let host: string;
  try {
    host = new URL(parsed.data.url).hostname;
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  const { pages, errors } = await crawlSite({
    startUrl: parsed.data.url,
    maxPages: parsed.data.maxPages,
    respectRobots: parsed.data.respectRobots,
  });

  const out: SitemapResult = {
    ok: true,
    pageCount: pages.length,
    errorCount: errors.length,
    hostLabel: host,
    xml: buildSitemapXml(pages),
    txt: buildSitemapTxt(pages),
    html: buildSitemapHtml(pages, host),
    sample: pages.slice(0, 25).map((p) => p.url),
  };
  await saveToolRun({
    toolId: "sitemap",
    label: `${host} · ${pages.length} pages · ${errors.length} errors`,
    input: { url: parsed.data.url, maxPages: parsed.data.maxPages },
    result: out,
  }).catch(() => undefined);
  return out;
}
