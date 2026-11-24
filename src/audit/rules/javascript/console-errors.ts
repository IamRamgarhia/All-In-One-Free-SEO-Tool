import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const IGNORABLE_PATTERNS = [
  /^Failed to load resource/i,
  // covered in detail by js-failed-requests
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /\[Intervention\]/i,
  /was preloaded using link preload but not used/i,
  /Tracking Prevention blocked/i,
  /Third-party cookie will be blocked/i
];
export function isIgnorable(text: string) {
  return IGNORABLE_PATTERNS.some((pattern) => pattern.test(text));
}
export function summarise(text: string) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 157)}...` : oneLine;
}
export const consoleErrorsRule = defineRule({
  id: "js-console-errors",
  name: "JavaScript Console Errors",
  description: "Reports uncaught JavaScript exceptions and console errors captured while rendering the page",
  category: "js",
  weight: 8,
  run: (context) => {
    const diagnostics = context.renderDiagnostics;
    if (!diagnostics) {
      return notMeasured(
        "js-console-errors",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to capture JavaScript errors"
      );
    }
    const pageErrors = diagnostics.pageErrors.map(summarise);
    const consoleErrors = diagnostics.consoleMessages.filter((message) => message.level === "error" && !isIgnorable(message.text)).map((message) => summarise(message.text));
    const details = {
      pageErrorCount: pageErrors.length,
      consoleErrorCount: consoleErrors.length,
      pageErrors: pageErrors.slice(0, 10),
      consoleErrors: consoleErrors.slice(0, 10)
    };
    if (pageErrors.length > 0) {
      return fail(
        "js-console-errors",
        `${pageErrors.length} uncaught JavaScript error(s) while rendering: ${pageErrors[0]}`,
        {
          ...details,
          impact: "An uncaught exception halts the script that threw it, so any content, structured data or meta tags it would have written never appear to a rendering crawler."
        }
      );
    }
    if (consoleErrors.length > 0) {
      return warn(
        "js-console-errors",
        `${consoleErrors.length} console error(s) while rendering: ${consoleErrors[0]}`,
        details
      );
    }
    return pass("js-console-errors", "No JavaScript errors while rendering the page", details);
  }
});
