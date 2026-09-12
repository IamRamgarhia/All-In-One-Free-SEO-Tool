/**
 * What we know about a client, and what is allowed to overwrite it.
 *
 * The whole module exists because three parts of the tool worked out
 * what a business sells independently and disagreed. The risk in fixing
 * that by writing the answer down is a new and worse failure: a
 * scheduled crawl quietly replacing something a person typed. That is
 * invisible until somebody notices the tool has forgotten a correction,
 * and by then nobody remembers what the correction was.
 *
 * So the first two tests here are the ones that matter.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { clientContext, clientResearchLog, clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  appendResearchLog,
  contextForPrompt,
  getClientContext,
  saveSiteRead,
  siteReadToVocabulary,
  updateCuratedContext,
} from "./client-knowledge";
import type { SiteVocabulary } from "./site-vocabulary";

const VOCAB: SiteVocabulary = {
  pagesRead: 13,
  urlsRead: ["https://prateektapes.com/", "https://prateektapes.com/bopp"],
  selfDescription:
    "Prateek Tapes — Adhesive Tape Manufacturer India Since 1987. Quality products since 1987.",
  terms: [
    { term: "bopp packaging tapes", confidence: 75, sources: ["heading", "product_schema"], pages: 3 },
    { term: "kraft paper tapes", confidence: 75, sources: ["nav", "h1"], pages: 3 },
    { term: "floor marking", confidence: 35, sources: ["nav"], pages: 1 },
  ],
  brandWords: ["prateek"],
};

let clientId = 0;

beforeEach(async () => {
  const [row] = await db
    .insert(clients)
    .values({ name: "Prateek Tapes", url: "https://prateektapes.com" })
    .returning({ id: clients.id });
  clientId = row.id;
});

afterEach(async () => {
  // client_context and client_research_log cascade from clients.
  await db.delete(clients).where(eq(clients.id, clientId));
});

describe("a crawl never erases what a person wrote", () => {
  it("leaves the curated half alone", async () => {
    await updateCuratedContext(
      clientId,
      {
        businessOverview: "Industrial tape manufacturer. Not a retailer.",
        audience: "Packaging buyers and converters",
        notes: "Do not suggest 'near me' keywords.",
      },
      "app",
    );

    await saveSiteRead(clientId, VOCAB);

    const view = await getClientContext(clientId);
    expect(view.curated?.businessOverview).toBe(
      "Industrial tape manufacturer. Not a retailer.",
    );
    expect(view.curated?.audience).toBe("Packaging buyers and converters");
    expect(view.curated?.notes).toBe("Do not suggest 'near me' keywords.");
    // And the read did land.
    expect(view.site?.pagesRead).toBe(13);
  });

  it("leaves the read half alone when a person writes", async () => {
    // The mirror of the rule. A user editing their business overview
    // must not blank out the crawl, or the next keyword run silently
    // loses the product range.
    await saveSiteRead(clientId, VOCAB);
    await updateCuratedContext(clientId, { businessOverview: "Tape maker" }, "agent");

    const view = await getClientContext(clientId);
    expect(view.site?.products.map((p) => p.term)).toContain("bopp packaging tapes");
    expect(view.site?.selfDescription).toMatch(/Manufacturer/);
  });
});

describe("reading it back", () => {
  it("says nothing has been read rather than returning an empty read", async () => {
    // "Read the site and found nothing" and "never read the site" lead
    // to different actions, and a caller that cannot tell them apart
    // will show a user an empty product list as though it were a result.
    const view = await getClientContext(clientId);
    expect(view.site).toBeNull();
    expect(view.curated).toBeNull();
    expect(view.research).toEqual([]);
  });

  it("keeps every term with its confidence, not just the seeds", async () => {
    await saveSiteRead(clientId, VOCAB);
    const view = await getClientContext(clientId);
    const floorMarking = view.site?.products.find((p) => p.term === "floor marking");
    expect(floorMarking?.confidence).toBe(35);
  });

  it("round-trips a stored read into the shape the readers produce", async () => {
    await saveSiteRead(clientId, VOCAB);
    const view = await getClientContext(clientId);
    const back = siteReadToVocabulary(view.site!);
    expect(back.selfDescription).toBe(VOCAB.selfDescription);
    expect(back.terms.map((t) => t.term)).toEqual(VOCAB.terms.map((t) => t.term));
  });
});

describe("patching the curated half", () => {
  it("leaves out fields alone instead of clearing them", async () => {
    await updateCuratedContext(
      clientId,
      { businessOverview: "Tape maker", audience: "Converters" },
      "app",
    );
    await updateCuratedContext(clientId, { notes: "Exports to the Gulf" }, "agent");

    const view = await getClientContext(clientId);
    expect(view.curated?.businessOverview).toBe("Tape maker");
    expect(view.curated?.audience).toBe("Converters");
    expect(view.curated?.notes).toBe("Exports to the Gulf");
  });

  it("clears a field when explicitly given null", async () => {
    // How a wrong answer gets removed. Without this the only way to
    // correct a bad overview is to write a different bad one.
    await updateCuratedContext(clientId, { businessOverview: "Wrong" }, "app");
    await updateCuratedContext(clientId, { businessOverview: null }, "app");
    const view = await getClientContext(clientId);
    expect(view.curated?.businessOverview ?? null).toBeNull();
  });

  it("records who wrote it", async () => {
    await updateCuratedContext(clientId, { businessOverview: "x" }, "mcp:claude-code");
    const view = await getClientContext(clientId);
    expect(view.curated?.curatedBy).toBe("mcp:claude-code");
  });
});

describe("the research log", () => {
  it("keeps entries newest first", async () => {
    await appendResearchLog(clientId, "First look", "agent");
    await appendResearchLog(clientId, "Second look", "mcp:claude-code");
    const view = await getClientContext(clientId);
    expect(view.research[0].summary).toBe("Second look");
    expect(view.research[0].source).toBe("mcp:claude-code");
  });

  it("refuses an empty entry rather than storing a blank row", async () => {
    await appendResearchLog(clientId, "   ", "agent");
    const rows = await db
      .select()
      .from(clientResearchLog)
      .where(eq(clientResearchLog.clientId, clientId));
    expect(rows).toEqual([]);
  });
});

describe("handing the context to a model", () => {
  it("marks what a user confirmed apart from what was read", async () => {
    // A model given "manufacturer of adhesive tape" with no provenance
    // treats a guess and a stated fact identically, and the guess is the
    // one that produces a confident wrong title.
    await updateCuratedContext(
      clientId,
      { businessOverview: "Industrial tape manufacturer" },
      "app",
    );
    await saveSiteRead(clientId, VOCAB);
    const text = contextForPrompt(await getClientContext(clientId))!;
    expect(text).toMatch(/confirmed by the user/);
    expect(text).toMatch(/How the site describes itself/);
  });

  it("offers only the corroborated products", async () => {
    await saveSiteRead(clientId, VOCAB);
    const text = contextForPrompt(await getClientContext(clientId))!;
    expect(text).toContain("bopp packaging tapes");
    // Seen once, in the nav, on one page. Below the floor.
    expect(text).not.toContain("floor marking");
  });

  it("returns null when there is nothing to say", async () => {
    // So callers leave the section out rather than sending an empty
    // heading, which reads to a model as "this is known to be empty".
    expect(contextForPrompt(await getClientContext(clientId))).toBeNull();
  });
});

describe("the two tables are wiped with the client", () => {
  it("leaves nothing behind", async () => {
    await saveSiteRead(clientId, VOCAB);
    await appendResearchLog(clientId, "Looked at it", "agent");
    await db.delete(clients).where(eq(clients.id, clientId));

    expect(
      await db.select().from(clientContext).where(eq(clientContext.clientId, clientId)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(clientResearchLog)
        .where(eq(clientResearchLog.clientId, clientId)),
    ).toEqual([]);
  });
});
