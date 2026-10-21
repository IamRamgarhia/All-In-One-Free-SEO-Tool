import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  defaultLocale,
  isLocale,
  localeCookieName,
  type Locale,
} from "@/i18n/config";
import { getSetting } from "@/lib/settings-store";
import toolsCatalogEn from "../../messages/tools-catalog.en.json";
import toolsCatalogFr from "../../messages/tools-catalog.fr.json";
import toolPagesEn from "../../messages/tools-pages.en.json";
import toolPagesFr from "../../messages/tools-pages.fr.json";

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

const TOOL_CATALOGS = {
  en: toolsCatalogEn,
  fr: toolsCatalogFr,
} as const;

const TOOL_PAGES = {
  en: toolPagesEn,
  fr: toolPagesFr,
} as const;

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const base = (await import(`../../messages/${locale}.json`)).default;
  return {
    locale,
    messages: {
      ...base,
      tools: {
        ...(base.tools ?? {}),
        catalog: TOOL_CATALOGS[locale],
        pages: TOOL_PAGES[locale],
      },
    },
  };
});
