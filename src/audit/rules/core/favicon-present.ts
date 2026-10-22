import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const faviconPresentRule = defineRule({
  id: "core-favicon-present",
  category: "core",
  severity: "low",
  weight: 3,
  title: "Favicon present",
  description: "Page should link a favicon",
  recommendation: 'Add <link rel="icon" href="/favicon.ico"> or a PNG/SVG icon.',
  check: async ({ $ }) => {
    const icon =
      $('link[rel="icon"]').length +
      $('link[rel="shortcut icon"]').length +
      $('link[rel="apple-touch-icon"]').length;
    if (icon === 0) return warn("No favicon link found");
    return pass("Favicon link is present");
  },
});
