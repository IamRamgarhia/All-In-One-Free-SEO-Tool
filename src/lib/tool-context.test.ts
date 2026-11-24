import { describe, expect, it } from "vitest";
import {
  cleanToolName,
  pagePathOf,
  parseToolContext,
  resolveToolContext,
  toolActivityMessages,
  toolTaskValues,
  type ContextTask,
} from "./tool-context";

const ND = { id: 2, name: "ND Prestige", url: "https://nd-prestige.fr" };
const TASKS: Record<number, ContextTask> = {
  41: { id: 41, clientId: 2, title: "Écrire la meta description", status: "todo", sourceRef: "audit:missing_meta_description" },
  77: { id: 77, clientId: 9, title: "Another client's task", status: "todo" },
};
const deps = (visibleIds: number[] | null) => ({
  visibleIds,
  loadClient: async (id: number) => (id === ND.id ? ND : null),
  loadTask: async (id: number) => TASKS[id] ?? null,
});

describe("parseToolContext", () => {
  it("reads the client, page, task and finding", () => {
    const p = parseToolContext(
      new URLSearchParams("clientId=2&url=https://nd-prestige.fr/contact&task=41&finding=missing_title"),
    );
    expect(p).toEqual({ clientId: 2, url: "https://nd-prestige.fr/contact", taskId: 41, finding: "missing_title" });
  });

  it("takes client= as a synonym of clientId=", () => {
    expect(parseToolContext({ client: "2" }).clientId).toBe(2);
  });

  it("drops an invalid URL, a junk id and a malformed finding", () => {
    for (const url of ["javascript:alert(1)", "ftp://x.fr/a", "pas une url", ""]) {
      expect(parseToolContext(new URLSearchParams({ clientId: "2", url })).url, url).toBeNull();
    }
    expect(parseToolContext({ clientId: "-3" }).clientId).toBeNull();
    expect(parseToolContext({ clientId: "2abc" }).clientId).toBeNull();
    expect(parseToolContext({ task: "0" }).taskId).toBeNull();
    expect(parseToolContext({ finding: "<script>" }).finding).toBeNull();
  });
});

describe("resolveToolContext", () => {
  it("gives the client's file, page and task", async () => {
    const ctx = await resolveToolContext(
      parseToolContext({ clientId: "2", url: "https://nd-prestige.fr/contact", task: "41" }),
      deps(null),
    );
    expect(ctx?.client.name).toBe("ND Prestige");
    expect(ctx?.pagePath).toBe("/contact");
    expect(ctx?.task?.id).toBe(41);
  });

  it("ignores a client the reader cannot see", async () => {
    expect(await resolveToolContext(parseToolContext({ clientId: "2" }), deps([5, 7]))).toBeNull();
    expect(await resolveToolContext(parseToolContext({ clientId: "2" }), deps([]))).toBeNull();
  });

  it("ignores an unknown client and no client at all", async () => {
    expect(await resolveToolContext(parseToolContext({ clientId: "99" }), deps(null))).toBeNull();
    expect(await resolveToolContext(parseToolContext({}), deps(null))).toBeNull();
  });

  it("drops a task of another client", async () => {
    const ctx = await resolveToolContext(parseToolContext({ clientId: "2", task: "77" }), deps(null));
    expect(ctx?.task).toBeNull();
  });

  it("falls back on the client's site when the URL is missing or invalid", async () => {
    const ctx = await resolveToolContext(parseToolContext({ clientId: "2", url: "javascript:void(0)" }), deps([2]));
    expect(ctx?.url).toBe("https://nd-prestige.fr/");
    expect(ctx?.pagePath).toBe("/");
  });
});

describe("a task added from a tool", () => {
  it("belongs to the client, names the page, the tool and the finding", async () => {
    const ctx = (await resolveToolContext(
      parseToolContext({ clientId: "2", url: "https://nd-prestige.fr/contact", finding: "broken_link" }),
      deps(null),
    ))!;
    const v = toolTaskValues(ctx, { toolPath: "/tools/link-checker?url=x", title: "  Réparer les liens  ", priority: "high" });
    expect(v).toEqual({
      clientId: 2,
      title: "Réparer les liens",
      priority: "high",
      status: "todo",
      toolPath: "/tools/link-checker",
      source: "tool",
      sourceRef: "tool:link-checker|broken_link",
      pages: [{ url: "https://nd-prestige.fr/contact", done: false }],
    });
  });

  it("records the tool as its source when no finding was given", async () => {
    const ctx = (await resolveToolContext(parseToolContext({ clientId: "2" }), deps(null)))!;
    expect(toolTaskValues(ctx, { toolPath: "/tools/crux", title: "Vitesse", priority: "low" }).sourceRef).toBe("tool:crux");
  });
});

describe("the journal line", () => {
  const p = { toolNameEn: "Link analysis", toolNameFr: "Analyse des liens", pagePath: "/contact", title: "Fix links" };

  it("says which tool, which page and what was done, in both languages", () => {
    const added = toolActivityMessages("task_added", { ...p, titleFr: "Réparer les liens" });
    expect(added.message).toBe("Tool Link analysis used on /contact: task added (“Fix links”)");
    expect(added.messageFr).toBe("Outil Analyse des liens utilisé sur /contact : tâche ajoutée (« Réparer les liens »)");
    expect(toolActivityMessages("task_completed", p).messageFr).toContain("tâche terminée");
  });

  it("reports a check on the site with its counts", () => {
    const m = toolActivityMessages("fix_checked", { ...p, resolved: 3, stillPresent: 1 });
    expect(m.message).toContain("3 pages confirmed fixed, 1 still to fix");
    expect(m.messageFr).toContain("vérifié sur le site, 3\u00a0pages confirmées corrigées, 1\u00a0encore à corriger");
    expect(toolActivityMessages("fix_checked", { ...p, resolved: 0, stillPresent: 2 }).messageFr).toContain("0\u00a0page confirmée corrigée");
  });
});

describe("display helpers", () => {
  it("strips the recommendation star from a tool name", () => {
    expect(cleanToolName("Audit E-E-A-T ⭐", "x")).toBe("Audit E-E-A-T");
    expect(cleanToolName(undefined, "crux")).toBe("crux");
  });

  it("shows a page as its path", () => {
    expect(pagePathOf("https://nd-prestige.fr/services?x=1")).toBe("/services?x=1");
    expect(pagePathOf("nope")).toBe("nope");
  });
});
