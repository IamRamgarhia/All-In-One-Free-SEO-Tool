"use server";

import { revalidatePath } from "next/cache";
import { setSetting, getSetting } from "@/lib/settings-store";
import type { ConnectionMode } from "@/lib/tool-capabilities";

export async function setConnectionMode(mode: ConnectionMode) {
  await setSetting("ai.connection_mode", mode);
  // The tools grid badges itself from this, so it has to revalidate too.
  revalidatePath("/", "layout");
}

export async function getConnectionMode(): Promise<ConnectionMode> {
  const m = await getSetting<ConnectionMode>("ai.connection_mode");
  return m ?? "none";
}
