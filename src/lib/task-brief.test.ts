import { describe, expect, it } from "vitest";
import { buildTaskBrief, stackHintsFor } from "./task-brief";

const task = {
  id: 124,
  title: "Fix sitemap.xml",
  description: "Add the missing pages.",
  whyItMatters: "Google should find every page.",
  priority: "high",
};

describe("buildTaskBrief", () => {
  it("points the assistant at the client's folder and the update tool", () => {
    const md = buildTaskBrief({
      task,
      client: {
        name: "D&D Garage",
        url: "https://ddgarage.ro/",
        techStack: ["Astro", "Cloudflare"],
        localPath: "C:\\work\\ddgarage",
      },
    });
    expect(md).toContain("# SEO task: Fix sitemap.xml");
    expect(md).toContain("Project folder: C:\\work\\ddgarage");
    expect(md).toContain("Work inside C:\\work\\ddgarage");
    expect(md).toContain("public/sitemap.xml");
    expect(md).toContain("mark task 124 done with the update_task tool");
  });

  it("tells the assistant to ask when no folder is set", () => {
    const md = buildTaskBrief({
      task,
      client: { name: "X", url: "https://x.test", techStack: null, localPath: null },
    });
    expect(md).not.toContain("Project folder:");
    expect(md).toContain("no project folder set");
  });

  it("matches stack hints loosely and ignores unknown stacks", () => {
    expect(stackHintsFor(["Next.js", "Vercel"]).map((h) => h.label)).toEqual(["Next.js"]);
    expect(stackHintsFor(["WooCommerce"]).map((h) => h.label)).toEqual(["WordPress"]);
    expect(stackHintsFor(["Hugo"])).toEqual([]);
    expect(stackHintsFor(null)).toEqual([]);
  });
});
