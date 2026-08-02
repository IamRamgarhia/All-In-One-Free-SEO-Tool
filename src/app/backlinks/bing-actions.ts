"use server";

import { revalidatePath } from "next/cache";
import { canSeeClient, currentUser } from "@/lib/auth";
import {
  importBingBacklinks,
  type BingImportResult,
} from "@/lib/backlink-import-bing";

export async function importBingBacklinksAction(
  clientId: number,
): Promise<BingImportResult> {
  // A server action is a public endpoint with a nicer calling
  // convention. Without this a member could import — and therefore
  // read — backlink data for any client in the agency by passing an id.
  if (!(await canSeeClient(await currentUser(), clientId))) {
    return {
      ok: false,
      added: 0,
      updated: 0,
      scannedPages: 0,
      error: "No such client.",
    };
  }

  const result = await importBingBacklinks(clientId);
  if (result.ok) {
    revalidatePath(`/backlinks/c/${clientId}`);
    revalidatePath("/backlinks");
  }
  return result;
}
