/**
 * What we know about a client's business, and where it came from.
 *
 * Not to be confused with client-context.ts, which answers a different
 * question — which client the current request is about. This one is what
 * we know about that client.
 *
 * Every part of this tool that needs to know what a business sells has
 * been working it out again from scratch, each time, and getting a
 * different answer. Keyword discovery reads the site. The title drafter
 * reads the `description` column. The niche is whatever somebody picked
 * from a dropdown. On one real client all three disagreed, and the
 * drafter — seeing a title tag that reads "Home Page" and nothing else —
 * proposed headlines for a mobile game that shares two words with the
 * company name.
 *
 * THE ONE RULE HERE
 *
 * A site read never overwrites what a person or an agent wrote. They are
 * different columns and different functions, and `saveSiteRead` cannot
 * reach the curated ones. Somebody who corrects "we are not a retailer"
 * must not have that erased by a crawl at 3am, and an agent that cannot
 * tell a fact it was told from a fact it inferred will keep re-inferring
 * the thing it was just corrected on.
 *
 * The research log exists for the same reason in time rather than in
 * space: three sessions asking the same question about the same client
 * will otherwise re-run the same crawl, the same SERP checks and the
 * same AI calls. On an install with a spend cap that is the cap gone on
 * work already done.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clientContext,
  clientResearchLog,
  type ContextKeyPage,
  type ContextProduct,
} from "@/db/schema";
import {
  readSiteVocabulary,
  SEED_CONFIDENCE_FLOOR,
  type SiteVocabulary,
} from "./site-vocabulary";

/** What the site said about itself, machine-read. */
export type SiteRead = {
  selfDescription: string | null;
  products: ContextProduct[];
  pagesRead: number;
  urlsRead: string[];
  readAt: Date | null;
  /** Why the read found nothing, when it found nothing. */
  note: string | null;
};

/** What a person or an agent concluded. */
export type CuratedContext = {
  businessOverview: string | null;
  audience: string | null;
  keyPages: ContextKeyPage[];
  notes: string | null;
  curatedAt: Date | null;
  curatedBy: string | null;
};

export type ResearchEntry = {
  summary: string;
  source: string | null;
  createdAt: Date;
};

export type ClientContextView = {
  clientId: number;
  /** Null when the site has never been read. */
  site: SiteRead | null;
  /** Null when nobody has written anything. */
  curated: CuratedContext | null;
  research: ResearchEntry[];
};

const EMPTY_VIEW = (clientId: number): ClientContextView => ({
  clientId,
  site: null,
  curated: null,
  research: [],
});

function hasCurated(row: {
  businessOverview: string | null;
  audience: string | null;
  keyPages: ContextKeyPage[] | null;
  notes: string | null;
}): boolean {
  return Boolean(
    row.businessOverview ||
      row.audience ||
      row.notes ||
      (row.keyPages && row.keyPages.length > 0),
  );
}

/**
 * Everything known about a client, read half and curated half separate.
 *
 * They stay separate all the way out to the caller. Merging them into
 * one "what this business does" string would lose the only thing that
 * decides which to trust when they disagree: whether a person said it.
 */
export async function getClientContext(
  clientId: number,
  opts: { researchLimit?: number } = {},
): Promise<ClientContextView> {
  const [row] = await db
    .select()
    .from(clientContext)
    .where(eq(clientContext.clientId, clientId))
    .limit(1);

  const research = await db
    .select({
      summary: clientResearchLog.summary,
      source: clientResearchLog.source,
      createdAt: clientResearchLog.createdAt,
    })
    .from(clientResearchLog)
    .where(eq(clientResearchLog.clientId, clientId))
    // Id breaks the tie. created_at is unixepoch seconds, so two entries
    // written in the same second sort arbitrarily on the timestamp alone
    // — and an agent writing "checked X" then "concluded Y" does exactly
    // that, then reads them back in the wrong order.
    .orderBy(desc(clientResearchLog.createdAt), desc(clientResearchLog.id))
    .limit(opts.researchLimit ?? 20);

  if (!row) return { ...EMPTY_VIEW(clientId), research };

  return {
    clientId,
    site:
      row.readAt || row.pagesRead
        ? {
            selfDescription: row.selfDescription,
            products: row.products ?? [],
            pagesRead: row.pagesRead ?? 0,
            urlsRead: row.urlsRead ?? [],
            readAt: row.readAt,
            note: row.readNote,
          }
        : null,
    curated: hasCurated(row)
      ? {
          businessOverview: row.businessOverview,
          audience: row.audience,
          keyPages: row.keyPages ?? [],
          notes: row.notes,
          curatedAt: row.curatedAt,
          curatedBy: row.curatedBy,
        }
      : null,
    research,
  };
}

/**
 * Store what a read of the site found.
 *
 * Touches only the read columns. It is not possible to call this in a
 * way that alters `businessOverview`, `audience`, `keyPages` or `notes`,
 * which is the point: a scheduled crawl runs unattended, and the damage
 * from it quietly replacing something a person typed is not visible
 * until somebody notices the tool has forgotten a correction.
 */
export async function saveSiteRead(
  clientId: number,
  vocab: SiteVocabulary,
): Promise<void> {
  const products: ContextProduct[] = vocab.terms
    // Everything the site said, not only the seeds — a term below the
    // seed floor is still evidence about the business, and the caller
    // can apply its own threshold. The confidence travels with it.
    .slice(0, 60)
    .map((t) => ({
      term: t.term,
      confidence: t.confidence,
      sources: t.sources,
    }));

  const values = {
    selfDescription: vocab.selfDescription,
    products,
    pagesRead: vocab.pagesRead,
    urlsRead: vocab.urlsRead.slice(0, 60),
    readAt: new Date(),
    readNote: vocab.note ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(clientContext)
    .values({ clientId, ...values })
    .onConflictDoUpdate({ target: clientContext.clientId, set: values });
}

/** The fields a person or an agent may write. */
export type CuratedPatch = {
  businessOverview?: string | null;
  audience?: string | null;
  keyPages?: ContextKeyPage[];
  notes?: string | null;
};

/**
 * Record what somebody concluded about the business.
 *
 * A field left out of the patch is left alone rather than cleared, so a
 * caller that knows one thing does not have to restate the rest. Passing
 * an explicit null clears it, which is how a wrong answer gets removed.
 */
export async function updateCuratedContext(
  clientId: number,
  patch: CuratedPatch,
  by: string,
): Promise<ClientContextView> {
  const set: Record<string, unknown> = { curatedAt: new Date(), curatedBy: by, updatedAt: new Date() };
  if ("businessOverview" in patch) set.businessOverview = patch.businessOverview;
  if ("audience" in patch) set.audience = patch.audience;
  if ("notes" in patch) set.notes = patch.notes;
  if ("keyPages" in patch) set.keyPages = patch.keyPages?.slice(0, 40) ?? [];

  await db
    .insert(clientContext)
    .values({ clientId, ...set })
    .onConflictDoUpdate({ target: clientContext.clientId, set });

  return getClientContext(clientId);
}

/** Add a line to what has already been looked into. */
export async function appendResearchLog(
  clientId: number,
  summary: string,
  source: string,
): Promise<void> {
  const line = summary.replace(/\s+/g, " ").trim().slice(0, 500);
  if (!line) return;
  await db
    .insert(clientResearchLog)
    .values({ clientId, summary: line, source, createdAt: new Date() });
}

/** Days after which a stored site read is treated as stale. */
export const SITE_READ_MAX_AGE_DAYS = 14;

/**
 * The site's vocabulary, read from the site only when what we have is
 * stale or missing.
 *
 * Reading thirteen pages takes a few seconds and hits somebody else's
 * server. Doing it again on every keyword run, every audit and every
 * agent session is both slow and rude, and the answer barely moves: a
 * business does not change what it sells between Tuesday and Wednesday.
 */
export async function ensureSiteRead(opts: {
  clientId: number;
  url: string;
  brand?: string | null;
  maxAgeDays?: number;
  /** Read even if what we have is fresh. */
  force?: boolean;
}): Promise<{ vocab: SiteVocabulary | null; fromCache: boolean }> {
  const maxAgeMs = (opts.maxAgeDays ?? SITE_READ_MAX_AGE_DAYS) * 86_400_000;

  if (!opts.force) {
    const stored = await getClientContext(opts.clientId, { researchLimit: 0 });
    const readAt = stored.site?.readAt;
    if (stored.site && readAt && Date.now() - readAt.getTime() < maxAgeMs) {
      return { vocab: siteReadToVocabulary(stored.site), fromCache: true };
    }
  }

  let vocab: SiteVocabulary;
  try {
    vocab = await readSiteVocabulary(opts.url, { brand: opts.brand });
  } catch {
    // An unreadable site is a fallback, not a failure. Callers carry on
    // with whatever else they have.
    return { vocab: null, fromCache: false };
  }
  await saveSiteRead(opts.clientId, vocab);
  return { vocab, fromCache: false };
}

/**
 * A stored read, back in the shape the readers produce.
 *
 * `brandWords` is not stored because nothing downstream reads it, and a
 * column nobody reads is a column that silently goes wrong.
 */
export function siteReadToVocabulary(site: SiteRead): SiteVocabulary {
  return {
    pagesRead: site.pagesRead,
    urlsRead: site.urlsRead,
    selfDescription: site.selfDescription,
    terms: site.products.map((p) => ({
      term: p.term,
      confidence: p.confidence,
      // The source list round-trips as strings; nothing downstream
      // narrows it back, and inventing a cast here would be the lie.
      sources: p.sources as SiteVocabulary["terms"][number]["sources"],
      pages: 1,
    })),
    brandWords: [],
    note: site.note ?? undefined,
  };
}

/**
 * The context as a short block for an AI prompt.
 *
 * Written so a model can tell what is established from what was
 * inferred. A model handed "manufacturer of adhesive tape" with no
 * provenance will treat a guess and a stated fact identically, and the
 * guess is the one that produces a confident wrong title.
 *
 * Returns null when there is nothing worth saying, so callers can leave
 * the section out entirely rather than sending an empty heading.
 */
export function contextForPrompt(
  view: ClientContextView,
  opts: { maxProducts?: number } = {},
): string | null {
  const lines: string[] = [];

  if (view.curated?.businessOverview) {
    lines.push(`The business (confirmed by the user): ${view.curated.businessOverview}`);
  }
  if (view.curated?.audience) {
    lines.push(`Who it sells to (confirmed by the user): ${view.curated.audience}`);
  }
  if (view.curated?.notes) {
    lines.push(`Notes from the user: ${view.curated.notes}`);
  }

  if (view.site?.selfDescription) {
    lines.push(`How the site describes itself: ${view.site.selfDescription}`);
  }

  const products = (view.site?.products ?? [])
    .filter((p) => p.confidence >= SEED_CONFIDENCE_FLOOR)
    .slice(0, opts.maxProducts ?? 20)
    .map((p) => p.term);
  if (products.length > 0) {
    lines.push(
      `What the site calls its own products and services: ${products.join(", ")}`,
    );
  }

  const keyPages = view.curated?.keyPages ?? [];
  if (keyPages.length > 0) {
    lines.push(
      `Pages that matter: ${keyPages
        .slice(0, 10)
        .map((p) => (p.why ? `${p.url} (${p.why})` : p.url))
        .join(", ")}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
