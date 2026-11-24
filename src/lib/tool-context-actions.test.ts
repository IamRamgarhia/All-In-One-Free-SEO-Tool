/**
 * "Add to <client>'s tasks" from a tool: the task lands on the right
 * client with the page and the tool, the journal gets its line, and a
 * reader who may not edit that client, or not see it, writes nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];
const logged: Record<string, unknown>[] = [];
let visible: number[] | null = null;
let mayEdit = true;

const CLIENT = { id: 2, name: "ND Prestige", url: "https://nd-prestige.fr" };

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "fr" }));
vi.mock("@/lib/action-guard", () => ({ requireSignedIn: async () => {}, isSignedIn: async () => true }));
vi.mock("@/lib/client-scope", () => ({ scopedClientIds: async () => visible }));
vi.mock("@/lib/auth", () => ({
  currentUser: async () => null,
  userMayEdit: () => mayEdit,
  requireClientAccess: async () => {
    if (!mayEdit) throw new Error("denied");
    return null;
  },
}));
vi.mock("@/lib/activity", () => ({
  logActivity: async (e: Record<string, unknown>) => {
    logged.push(e);
  },
}));
vi.mock("@/app/tasks/actions", () => ({ setTaskStatus: async () => {}, setTaskPageDone: async () => ({ ok: true }) }));
vi.mock("@/app/audits/issue-actions", () => ({ verifyIssuesFixed: async () => ({ ok: false, reason: "gone" }) }));
vi.mock("@/lib/audit", () => ({ isPageRecheckable: () => false }));
vi.mock("@/db/schema", () => ({ clients: { id: "c.id" }, tasks: { id: "t.id" }, auditIssues: {}, audits: {} }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: (table: { id: string }) => ({
        where: () => ({ get: async () => (table.id === "c.id" ? CLIENT : undefined) }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return { returning: async () => [{ id: 501 }] };
      },
    }),
  },
}));

const { addTaskFromTool } = await import("./tool-context-actions");
const query = "clientId=2&url=https%3A%2F%2Fnd-prestige.fr%2Fcontact&finding=broken_link";

describe("addTaskFromTool", () => {
  beforeEach(() => {
    inserted.length = 0;
    logged.length = 0;
    visible = null;
    mayEdit = true;
  });

  it("adds the task to the client and writes the journal line", async () => {
    const res = await addTaskFromTool({ query, toolPath: "/tools/link-checker", title: "Réparer les liens", priority: "high" });
    expect(res).toEqual({ ok: true, taskId: 501 });
    expect(inserted[0]).toMatchObject({
      clientId: 2,
      title: "Réparer les liens",
      priority: "high",
      toolPath: "/tools/link-checker",
      sourceRef: "tool:link-checker|broken_link",
      pages: [{ url: "https://nd-prestige.fr/contact", done: false }],
    });
    expect(logged[0]).toMatchObject({ kind: "tool.task_added", clientId: 2, entityType: "task", entityId: 501 });
    expect(String(logged[0].messageFr)).toContain("Outil Analyse des liens utilisé sur /contact");
  });

  it("writes nothing for a client the reader cannot see", async () => {
    visible = [7];
    const res = await addTaskFromTool({ query, toolPath: "/tools/link-checker", title: "Réparer", priority: "low" });
    expect(res).toEqual({ ok: false, error: "context" });
    expect(inserted).toEqual([]);
    expect(logged).toEqual([]);
  });

  it("writes nothing for a reader who may not edit", async () => {
    mayEdit = false;
    const res = await addTaskFromTool({ query, toolPath: "/tools/link-checker", title: "Réparer", priority: "low" });
    expect(res).toEqual({ ok: false, error: "denied" });
    expect(inserted).toEqual([]);
  });

  it("refuses an empty title and a page that is not a tool", async () => {
    expect(await addTaskFromTool({ query, toolPath: "/tools/link-checker", title: " ", priority: "low" })).toEqual({ ok: false, error: "title" });
    expect(await addTaskFromTool({ query, toolPath: "/clients/2", title: "Réparer", priority: "low" })).toEqual({ ok: false, error: "context" });
    expect(inserted).toEqual([]);
  });
});
