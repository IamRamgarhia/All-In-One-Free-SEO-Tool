import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale,
} from "@/i18n/config";
import { getSetting } from "@/lib/settings-store";

async function resolveLocale(): Promise<Locale> {
  try {
    const jar = await cookies();
    const fromCookie = jar.get(localeCookieName)?.value;
    if (isLocale(fromCookie)) return fromCookie;
  } catch {
    /* cookies() can throw outside a request */
  }

  try {
    const fromSettings = await getSetting<string>("ui.locale");
    if (isLocale(fromSettings)) return fromSettings;
  } catch {
    /* DB may be unavailable during early boot */
  }

  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
