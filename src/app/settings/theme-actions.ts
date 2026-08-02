"use server";

import { revalidatePath } from "next/cache";
import { setSetting, getSetting } from "@/lib/settings-store";

/**
 * "system" follows the OS preference and is the default — a tool that
 * ignores the OS setting and forces one look is the thing people
 * complain about, in either direction.
 */
export type ThemePreference = "light" | "dark" | "system";

export async function getThemePreference(): Promise<ThemePreference> {
  const t = await getSetting<ThemePreference>("ui.theme");
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}

export async function setThemePreference(theme: ThemePreference) {
  await setSetting("ui.theme", theme);
  // Layout-level: the <html> class is rendered in the root layout, so
  // every route needs revalidating for the change to take effect.
  revalidatePath("/", "layout");
}

/** Cycle light -> dark -> system, for the single-button toggle. */
export async function cycleTheme() {
  const current = await getThemePreference();
  const next: ThemePreference =
    current === "light" ? "dark" : current === "dark" ? "system" : "light";
  await setThemePreference(next);
}
