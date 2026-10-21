import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const headingOrderRule = defineRule({
  id: "core-heading-order",
  category: "core",
  severity: "low",
  weight: 4,
  title: "Heading hierarchy",
  description: "Heading levels should not skip (H1 → H3)",
  recommendation: "Keep a logical H1–H6 order without skipping levels.",
  check: async ({ $ }) => {
    const levels: number[] = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      const tag = String($(el).prop("tagName") ?? "").toLowerCase();
      const n = Number(tag.replace("h", ""));
      if (n >= 1 && n <= 6) levels.push(n);
    });
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1]!;
      const cur = levels[i]!;
      if (cur > prev + 1) {
        return warn(`Heading skips from H${prev} to H${cur}`, { levels });
      }
    }
    return pass("Heading hierarchy looks consistent", { count: levels.length });
  },
});
