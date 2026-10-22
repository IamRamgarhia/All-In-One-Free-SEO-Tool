import { defineRule, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

export const cookieConsentRule = defineRule({
  id: "legal-cookie-consent",
  category: "legal",
  severity: "medium",
  weight: 20,
  title: "Cookie consent signals",
  description: "Sites setting non-essential cookies should offer consent UI",
  recommendation:
    "Add a cookie consent banner (CookieYes, OneTrust, Cookiebot, or custom CMP).",
  check: async ({ $, response }) => {
    const setCookie =
      Object.entries(response.headers).find(([k]) => k.toLowerCase() === "set-cookie")?.[1] ??
      "";
    const html = $.root().html() ?? "";
    const text = $("body").text().toLowerCase();
    const consentUi =
      /cookieyes|onetrust|cookiebot|didomi|axeptio|tarteaucitron|cookieconsent|cmplz|gdpr/i.test(
        html,
      ) ||
      (/cookie|cookies|consentement|accepter|refuse/.test(text) &&
        $("#cookie, .cookie, [class*='cookie'], [id*='consent']").length > 0);

    const trackingHints =
      /google-analytics|gtag\(|googletagmanager|facebook\.net\/tr|hotjar|segment\.com/i.test(
        html,
      ) || /_ga|_fbp|__hstc/.test(setCookie);

    if (consentUi) return pass("Cookie consent / CMP signals found");
    if (trackingHints) {
      return warn("Tracking signals without clear cookie-consent UI");
    }
    return pass("No strong tracking+missing-consent smell");
  },
});

export const privacyLinkLegalRule = defineRule({
  id: "legal-privacy-link",
  category: "legal",
  severity: "medium",
  weight: 12,
  title: "Privacy policy reachable",
  description: "Privacy policy should be linked from the page",
  recommendation: "Link a privacy policy (required in many jurisdictions).",
  check: async ({ $ }) => {
    let found = false;
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") ?? "").toLowerCase();
      const text = $(el).text().toLowerCase();
      if (/privacy|confidentialit|datenschutz/.test(href + " " + text)) found = true;
    });
    if (found) return pass("Privacy policy link found");
    return warn("No privacy policy link detected");
  },
});

const LEGAL_RULES = [cookieConsentRule, privacyLinkLegalRule];

export function registerLegalRules(): void {
  for (const rule of LEGAL_RULES) registerRule(rule);
}

export { LEGAL_RULES };
