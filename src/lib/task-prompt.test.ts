import { describe, expect, it } from "vitest";
import { buildAuditPrompt, buildTaskPrompt, openPages, promptFileName, stackHintsFor } from "./task-prompt";

const task = {
  id: 124,
  title: "Fix sitemap.xml",
  description: "Add the missing pages.",
  whyItMatters: "Google should find every page.",
  priority: "high",
  pages: [
    { url: "https://ddgarage.ro/services", done: false },
    { url: "https://ddgarage.ro/contact", done: true },
  ],
};

const client = {
  name: "D&D Garage",
  url: "https://ddgarage.ro/",
  techStack: ["Astro", "Cloudflare"],
  localPath: "/home/me/sites/ddgarage",
  githubRepo: "agency/ddgarage",
  baseBranch: "main",
};

describe("buildTaskPrompt", () => {
  it("gives the task, the folder, the pages still to fix and how to check", () => {
    const md = buildTaskPrompt({ task, client, locale: "en" });
    expect(md).toContain("# SEO task: Fix sitemap.xml");
    expect(md).toContain("Project folder: /home/me/sites/ddgarage");
    expect(md).toContain("Work only inside /home/me/sites/ddgarage");
    expect(md).toContain("- https://ddgarage.ro/services");
    expect(md).not.toContain("https://ddgarage.ro/contact"); // ticked, so done
    expect(md).toContain("public/sitemap.xml");
    expect(md).toContain("## How to check");
    expect(md).toContain("never push directly to main");
  });

  it("is in French, with French typography, when the workspace is", () => {
    const md = buildTaskPrompt({ task, client, locale: "fr" });
    expect(md).toContain("# Tâche SEO : Fix sitemap.xml");
    expect(md).toContain("Dossier du projet : /home/me/sites/ddgarage");
    expect(md).toContain("## Vérification");
    expect(md).toContain("Priorité : haute");
    expect(md).not.toMatch(/ [:;?!]/); // no ordinary space before high punctuation
  });

  it("asks where the code is when no folder is set, and says nothing of branches without a repo", () => {
    const md = buildTaskPrompt({
      task: { ...task, pages: null },
      client: { name: "X", url: "https://x.test", techStack: null, localPath: null },
      locale: "en",
    });
    expect(md).not.toContain("Project folder:");
    expect(md).toContain("No project folder is set");
    expect(md).not.toContain("pull request");
    expect(md).toContain("Open https://x.test and confirm");
  });

  it("keeps internal documents out of the client's repository", () => {
    expect(buildTaskPrompt({ task, client, locale: "en" })).toContain("do not save it in the client's repository");
    expect(buildTaskPrompt({ task, client, locale: "fr" })).toContain("ne l’enregistrez pas dans le dépôt du client");
  });

  it("never claims the tool marks the task done by itself", () => {
    expect(buildTaskPrompt({ task, client, locale: "en" })).toContain("marked done in the SEO tool by the person who reviews it");
  });
});

describe("buildAuditPrompt", () => {
  it("wraps the LLM export unchanged and words recommendations as such", () => {
    const report = "# Audit\n- Missing title on /a";
    const md = buildAuditPrompt({ url: "https://x.test", client, report, locale: "en" });
    expect(md).toContain("# Fix the issues from the SEO audit of https://x.test");
    expect(md.endsWith(`${report}\n`)).toBe(true);
    expect(md).toContain("good practice, not requirements");
  });
});

describe("helpers", () => {
  it("matches stack hints loosely and ignores unknown stacks", () => {
    expect(stackHintsFor(["Next.js", "Vercel"]).map((h) => h.label)).toEqual(["Next.js"]);
    expect(stackHintsFor(["WooCommerce"]).map((h) => h.label)).toEqual(["WordPress"]);
    expect(stackHintsFor(["Hugo"])).toEqual([]);
    expect(stackHintsFor(null)).toEqual([]);
  });

  it("lists only the pages not yet ticked", () => {
    expect(openPages(task.pages)).toEqual(["https://ddgarage.ro/services"]);
    expect(openPages(null)).toEqual([]);
  });

  it("names the downloaded file", () => {
    expect(promptFileName("task", 7)).toBe("tache-7.prompt.md");
    expect(promptFileName("audit", 3)).toBe("audit-3.prompt.md");
  });
});
