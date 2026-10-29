"use server";

import { revalidatePath } from "next/cache";
import { guardAction } from "@/lib/action-guard";
import { saveHostAgentEnabled } from "@/lib/host-agent";

export async function saveHostAgent(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  await guardAction("settings");
  const enabled = formData.get("enabled") === "on";
  if (!saveHostAgentEnabled(enabled)) {
    return { ok: false, error: "The server's environment forces this off. Remove SEO_TOOL_HOST_AGENT=0 to change it here." };
  }
  // The dock lives in the root layout, so every page has to re-render.
  revalidatePath("/", "layout");
  return { ok: true };
}
