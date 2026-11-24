import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: { message: string }[] = [];
let locale = "fr";

vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: async (v: { message: string }) => {
        inserted.push(v);
      },
    }),
  },
}));
vi.mock("@/db/schema", () => ({ activityLog: {} }));
vi.mock("./auth", () => ({ currentUserId: async () => null }));
vi.mock("./report-i18n", () => ({ getReportLocale: async () => locale }));

const { logActivity } = await import("./activity");

describe("logActivity", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("writes the French message in a French workspace", async () => {
    locale = "fr";
    await logActivity({ kind: "task.created", message: "Lost backlink", messageFr: "Backlink perdu", dedupe: false });
    expect(inserted[0]?.message).toBe("Backlink perdu");
  });

  it("keeps the English message otherwise, or when no French is given", async () => {
    locale = "en";
    await logActivity({ kind: "task.created", message: "Lost backlink", messageFr: "Backlink perdu", dedupe: false });
    locale = "fr";
    await logActivity({ kind: "task.created", message: "Lost backlink", dedupe: false });
    expect(inserted.map((r) => r.message)).toEqual(["Lost backlink", "Lost backlink"]);
  });
});
