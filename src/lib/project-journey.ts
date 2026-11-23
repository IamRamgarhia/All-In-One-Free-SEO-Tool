/**
 * The seven steps of a project, and the one to do next.
 *
 *   prospection -> setup -> audit -> strategy -> missions -> delivery -> followup
 *
 * Every step is read from what exists (an audit, a sent proposal, an active
 * mission, a report), never from a box someone ticked: a frieze that can
 * claim a step is done when it is not is worse than no frieze.
 *
 * Pure: no database, no React. The project page gathers the facts and
 * components/project-journey.tsx draws the result.
 */
import type { MissionKind, MissionStatus } from "./mission-kinds";
import { isRecurring } from "./missions";

export const JOURNEY_STEPS = [
  "prospection",
  "setup",
  "audit",
  "strategy",
  "missions",
  "delivery",
  "followup",
] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

export type JourneyFacts = {
  projectId: number;
  /** Any completed audit, quick or full: the first score shown to a prospect. */
  anyAuditDone: boolean;
  /**
   * A completed crawl of the site, quick or full, that read at least one
   * page. The quick audit run when the project is added counts: it is what
   * the mission is chosen on. The AI audit does not.
   */
  siteAuditDone: boolean;
  /** The onboarding (scope, accesses, keywords) was gone through. */
  onboardingDone: boolean;
  /** The latest proposal, if one was built. */
  proposalId: number | null;
  proposalStatus: "draft" | "sent" | "accepted" | "declined" | null;
  missions: ReadonlyArray<{ kind: MissionKind; status: MissionStatus }>;
  /** Reports generated for the client. */
  reportCount: number;
  /** A scheduled report is switched on. */
  reportScheduled: boolean;
};

export type JourneyState = {
  steps: { key: JourneyStep; done: boolean }[];
  /** The first step not done; null once all seven are. */
  current: JourneyStep | null;
  /** Where the "next step" button leads. Null with `current`. */
  href: string | null;
  /**
   * Which wording the button and the status line take for the current
   * step, as a key into the `clientPage.journey.next` messages.
   */
  variant: string | null;
};

const SOLD: ReadonlySet<MissionStatus> = new Set<MissionStatus>(["active", "paused", "done"]);

export function projectJourney(f: JourneyFacts): JourneyState {
  const id = f.projectId;
  const sold = f.missions.filter((m) => SOLD.has(m.status));
  const proposalOut = f.proposalStatus === "sent" || f.proposalStatus === "accepted";
  const recurring = f.missions.some((m) => m.status === "active" && isRecurring(m.kind));

  const done: Record<JourneyStep, boolean> = {
    // A project with a proposal or a mission is past prospection even if
    // its first audit was deleted since.
    prospection: f.anyAuditDone || f.proposalId !== null || f.missions.length > 0,
    setup: f.onboardingDone,
    audit: f.siteAuditDone,
    strategy: proposalOut,
    missions: sold.length > 0,
    delivery: f.reportCount > 0,
    followup: recurring && f.reportScheduled,
  };

  const steps = JOURNEY_STEPS.map((key) => ({ key, done: done[key] }));
  const current = steps.find((s) => !s.done)?.key ?? null;
  if (!current) return { steps, current: null, href: null, variant: null };

  let href: string;
  let variant: string = current;
  switch (current) {
    case "prospection":
    case "audit":
      href = `/audits/c/${id}`;
      break;
    case "setup":
      href = `/clients/${id}/onboarding`;
      break;
    case "strategy":
      // Built is not sent: a draft only needs sending, a refusal a new one.
      if (f.proposalId !== null && f.proposalStatus === "draft") {
        href = `/proposals/${f.proposalId}/pdf`;
        variant = "strategyDraft";
      } else {
        href = `/clients/${id}/onboarding`;
        if (f.proposalStatus === "declined") variant = "strategyDeclined";
      }
      break;
    case "missions":
      href = `/clients/${id}?tab=missions`;
      // A mission on offer only needs the client's yes.
      if (f.missions.some((m) => m.status === "proposed")) variant = "missionsProposed";
      break;
    case "delivery":
      href = `/reports/c/${id}`;
      break;
    case "followup":
      if (recurring) {
        href = `/reports/c/${id}`;
      } else {
        // Nothing recurring was sold: the next step is to offer it.
        href = `/clients/${id}?tab=missions`;
        variant = "followupOffer";
      }
      break;
  }
  return { steps, current, href, variant };
}

/** Every wording the button can take, for the test that checks each has a message. */
export const JOURNEY_VARIANTS = [
  ...JOURNEY_STEPS,
  "strategyDraft",
  "strategyDeclined",
  "missionsProposed",
  "followupOffer",
] as const;
