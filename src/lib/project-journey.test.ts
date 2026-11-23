import { describe, expect, it } from "vitest";
import fr from "../../messages/fr.json";
import en from "../../messages/en.json";
import { JOURNEY_STEPS, JOURNEY_VARIANTS, projectJourney, type JourneyFacts } from "./project-journey";

const NEW: JourneyFacts = {
  projectId: 7,
  anyAuditDone: false,
  siteAuditDone: false,
  onboardingDone: false,
  proposalId: null,
  proposalStatus: null,
  missions: [],
  reportCount: 0,
  reportScheduled: false,
};

describe("projectJourney", () => {
  it("starts a new project at prospection, on the audit", () => {
    const j = projectJourney(NEW);
    expect(j.current).toBe("prospection");
    expect(j.href).toBe("/audits/c/7");
    expect(j.steps.map((s) => s.key)).toEqual([...JOURNEY_STEPS]);
    expect(j.steps.every((s) => !s.done)).toBe(true);
  });

  it("a quick audit ends prospection, not the audit step", () => {
    const j = projectJourney({ ...NEW, anyAuditDone: true });
    expect(j.current).toBe("setup");
    expect(j.href).toBe("/clients/7/onboarding");
    expect(j.steps.find((s) => s.key === "audit")?.done).toBe(false);
  });

  it("the first step not done is the current one, even when later ones are done", () => {
    const j = projectJourney({ ...NEW, anyAuditDone: true, siteAuditDone: true, reportCount: 2 });
    expect(j.current).toBe("setup");
    expect(j.steps.find((s) => s.key === "delivery")?.done).toBe(true);
  });

  it("a draft proposal is to be sent, a refused one rewritten", () => {
    const base = { ...NEW, anyAuditDone: true, siteAuditDone: true, onboardingDone: true, proposalId: 3 };
    const draft = projectJourney({ ...base, proposalStatus: "draft" });
    expect(draft.current).toBe("strategy");
    expect(draft.variant).toBe("strategyDraft");
    expect(draft.href).toBe("/proposals/3/pdf");
    const declined = projectJourney({ ...base, proposalStatus: "declined" });
    expect(declined.variant).toBe("strategyDeclined");
    expect(declined.href).toBe("/clients/7/onboarding");
    expect(projectJourney({ ...base, proposalStatus: "sent" }).current).toBe("missions");
  });

  it("a proposed mission is not sold yet", () => {
    const base = {
      ...NEW,
      anyAuditDone: true,
      siteAuditDone: true,
      onboardingDone: true,
      proposalId: 3,
      proposalStatus: "accepted" as const,
    };
    const proposed = projectJourney({ ...base, missions: [{ kind: "monitoring", status: "proposed" }] });
    expect(proposed.current).toBe("missions");
    expect(proposed.variant).toBe("missionsProposed");
    const active = projectJourney({ ...base, missions: [{ kind: "monitoring", status: "active" }] });
    expect(active.current).toBe("delivery");
    expect(active.href).toBe("/reports/c/7");
  });

  it("follow-up needs a recurring mission and a scheduled report", () => {
    const base = {
      ...NEW,
      anyAuditDone: true,
      siteAuditDone: true,
      onboardingDone: true,
      proposalId: 3,
      proposalStatus: "accepted" as const,
      reportCount: 1,
    };
    const oneOff = projectJourney({ ...base, missions: [{ kind: "audit", status: "done" }], reportScheduled: true });
    expect(oneOff.current).toBe("followup");
    expect(oneOff.variant).toBe("followupOffer");
    expect(oneOff.href).toBe("/clients/7?tab=missions");
    const unscheduled = projectJourney({ ...base, missions: [{ kind: "monitoring", status: "active" }] });
    expect(unscheduled.variant).toBe("followup");
    expect(unscheduled.href).toBe("/reports/c/7");
    const cruising = projectJourney({
      ...base,
      missions: [{ kind: "full", status: "active" }],
      reportScheduled: true,
    });
    expect(cruising.current).toBeNull();
    expect(cruising.href).toBeNull();
    expect(cruising.steps.every((s) => s.done)).toBe(true);
  });

  it("has a name for every step and a wording for every variant, in both languages", () => {
    for (const messages of [fr, en]) {
      const j = messages.clientPage.journey as {
        steps: Record<string, string>;
        next: Record<string, { status: string; cta: string }>;
      };
      for (const s of JOURNEY_STEPS) expect(j.steps[s], s).toBeTruthy();
      for (const v of JOURNEY_VARIANTS) {
        expect(j.next[v]?.status, v).toBeTruthy();
        expect(j.next[v]?.cta, v).toBeTruthy();
      }
    }
  });
});
