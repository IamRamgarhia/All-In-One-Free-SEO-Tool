"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale,
} from "@/i18n/config";
import { getSetting, setSetting } from "@/lib/settings-store";

export async function getLocalePreference(): Promise<Locale> {
  const stored = await getSetting<string>("ui.locale");
  if (isLocale(stored)) return stored;
  return defaultLocale;
}

export async function setLocalePreference(locale: Locale) {
  if (!isLocale(locale)) return;
  await setSetting("ui.locale", locale);
  const jar = await cookies();
  jar.set(localeCookieName, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
