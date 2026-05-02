"use server";

import { findBrokenLinks, type BrokenLinksResult } from "@/lib/broken-links";

export async function checkUrl(url: string): Promise<BrokenLinksResult> {
  return findBrokenLinks(url);
}
