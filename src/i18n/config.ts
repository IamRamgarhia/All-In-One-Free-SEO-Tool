export const locales = ["fr", "en"] as const;

export type Locale = (typeof locales)[number];

/** French is the default locale for this workspace. */
export const defaultLocale: Locale = "fr";

export const localeCookieName = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

export const localeLabels: Record<Locale, string> = {
  fr: "Français",
  en: "English",
};
