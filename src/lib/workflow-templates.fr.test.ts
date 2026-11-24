import { describe, expect, it } from "vitest";
import { workflowTemplates } from "./workflow-templates";
import { WORKFLOW_TEMPLATES_FR } from "./workflow-templates.fr";

describe("French automation templates", () => {
  it("translates every template", () => {
    expect(Object.keys(WORKFLOW_TEMPLATES_FR).sort()).toEqual(workflowTemplates.map((t) => t.id).sort());
  });

  it("translates the task title or log line each template writes", () => {
    for (const t of workflowTemplates) {
      const fr = WORKFLOW_TEMPLATES_FR[t.id];
      if (t.action.kind === "create_task") expect(fr.title, t.id).toBeTruthy();
      if (t.action.kind === "log") expect(fr.message, t.id).toBeTruthy();
    }
  });
});
