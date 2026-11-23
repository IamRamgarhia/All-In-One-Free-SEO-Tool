import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const horizontalScrollRule = defineRule({
  id: "mobile-horizontal-scroll",
  name: "Horizontal Scroll",
  description: "Checks for elements that may cause horizontal scrolling on mobile",
  category: "mobile",
  weight: 15,
  run: (context) => {
    const { $ } = context;
    const issues: Array<{ element: string; issue: string; cause: string; }> = [];
    const MOBILE_WIDTH = 400;
    $('[style*="width"]').each((_, el) => {
      const $el = $(el);
      const style = $el.attr("style") || "";
      const widthMatch = style.match(/(?:^|;)\s*width\s*:\s*(\d+)(px|vw)?/i);
      if (widthMatch) {
        const width = parseInt(widthMatch[1], 10);
        const unit = widthMatch[2]?.toLowerCase() || "px";
        if (unit === "px" && width > MOBILE_WIDTH) {
          const tag = el.tagName?.toLowerCase() || "element";
          const id = $el.attr("id");
          const className = $el.attr("class")?.split(" ")[0];
          issues.push({
            element: id ? `${tag}#${id}` : className ? `${tag}.${className}` : tag,
            issue: "Fixed width exceeds mobile viewport",
            cause: `width: ${width}px`
          });
        }
      }
    });
    // Image width attributes are not checked. They are what keeps the layout
    // from shifting (images-dimensions asks for them), and every modern stylesheet
    // caps images at their container (max-width: 100%), which this static
    // reading of the HTML cannot see. Counting them made nd-prestige.com, which
    // does not scroll sideways at 390 px, fail this rule on 18 pages.
    $("table").each((_, el) => {
      const $el = $(el);
      const style = $el.attr("style") || "";
      const parentStyle = $el.parent().attr("style") || "";
      const hasOverflow = style.includes("overflow") || parentStyle.includes("overflow") || $el.parent().hasClass("table-responsive") || $el.parent().css("overflow-x") === "auto";
      const tableWidth = style.match(/width\s*:\s*(\d+)px/i);
      if (tableWidth && parseInt(tableWidth[1], 10) > MOBILE_WIDTH && !hasOverflow) {
        issues.push({
          element: "table",
          issue: "Wide table without overflow handling",
          cause: `width: ${tableWidth[1]}px, no overflow-x: auto on container`
        });
      }
    });
    $("pre, code").each((_, el) => {
      const $el = $(el);
      const style = $el.attr("style") || "";
      const parentStyle = $el.parent().attr("style") || "";
      const hasOverflow = style.includes("overflow") || style.includes("word-wrap") || style.includes("white-space: pre-wrap") || parentStyle.includes("overflow");
      if (el.tagName?.toLowerCase() === "pre" && !hasOverflow) {
        const textLength = $el.text().length;
        if (textLength > 100) {
          issues.push({
            element: "pre",
            issue: "Pre-formatted block may cause horizontal scroll",
            cause: "No overflow-x: auto or white-space: pre-wrap"
          });
        }
      }
    });
    $("iframe").each((_, el) => {
      const $el = $(el);
      const width = $el.attr("width");
      const style = $el.attr("style") || "";
      const styleWidth = style.match(/width\s*:\s*(\d+)px/i);
      if (width && !width.includes("%")) {
        const numWidth = parseInt(width, 10);
        if (numWidth > MOBILE_WIDTH) {
          const src = $el.attr("src") || "unknown";
          issues.push({
            element: `iframe: ${new URL(src, "http://example.com").hostname}`,
            issue: "Iframe with fixed width exceeds mobile viewport",
            cause: `width="${width}"`
          });
        }
      } else if (styleWidth && parseInt(styleWidth[1], 10) > MOBILE_WIDTH) {
        issues.push({
          element: "iframe",
          issue: "Iframe with fixed width exceeds mobile viewport",
          cause: styleWidth[0]
        });
      }
    });
    $('[style*="100vw"]').each((_, el) => {
      const $el = $(el);
      const style = $el.attr("style") || "";
      if (style.includes("width: 100vw") || style.includes("width:100vw")) {
        const tag = el.tagName?.toLowerCase() || "element";
        issues.push({
          element: tag,
          issue: "100vw may cause horizontal scroll due to scrollbar",
          cause: "width: 100vw (use 100% instead)"
        });
      }
    });
    if (issues.length === 0) {
      return pass(
        "mobile-horizontal-scroll",
        "No elements likely to cause horizontal scrolling detected",
        { note: "Static analysis - test on actual mobile devices" }
      );
    }
    // A guess from the markup, never a measurement: it warns, it does not fail.
    if (issues.length >= 5) {
      return warn(
        "mobile-horizontal-scroll",
        `Found ${issues.length} element(s) that may cause horizontal scrolling`,
        {
          issues: issues.slice(0, 10),
          totalIssues: issues.length,
          recommendation: "Use max-width: 100% on images, overflow-x: auto on tables, responsive iframes"
        }
      );
    }
    return warn(
      "mobile-horizontal-scroll",
      `Found ${issues.length} potential horizontal scroll issue(s)`,
      {
        issues: issues.slice(0, 10),
        totalIssues: issues.length,
        recommendation: "Add max-width: 100% to images, wrap tables in overflow containers"
      }
    );
  }
});
