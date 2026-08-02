/**
 * Who AI assistants cite for your topics, and how often it isn't you.
 *
 * We already record every citation from every AI-visibility check. What
 * was missing is the question people actually pay for: not "am I
 * mentioned" but "who is being cited instead of me, and from where."
 * That is the whole pitch of the dedicated GEO tools, and it is an
 * aggregation over a column we have been filling for months.
 *
 * Three decisions here matter more than the maths.
 *
 * **Only grounded answers count.** Every check records whether the model
 * actually searched the web (`live`) or answered from training memory
 * (`memory`). A memory answer tells you what a model absorbed months ago
 * — it is not evidence about AI search today, and averaging the two
 * produces a number that describes neither. Most tools in this category
 * don't draw the distinction at all. We already store it, so refusing to
 * blur it costs nothing and is the difference between a measurement and
 * a vibe.
 *
 * **The denominator is answers, not URLs.** A single response citing the
 * same domain four times is one answer that cited them. Counting URLs
 * would rank a page that got quoted heavily in one response above a
 * domain cited once in every response, which is backwards — consistency
 * across queries is the thing worth knowing.
 *
 * **Small samples say so.** Three checks is not a landscape. The result
 * carries its own sample size and a confidence band, because "Reddit
 * dominates your category" drawn from two answers is exactly the kind of
 * confident nonsense this codebase keeps finding.
 */

export type CitationCheckRow = {
  provider: string;
  prompt: string;
  citations: string[] | null;
  grounding: "live" | "memory";
};

export type CitationSource = {
  domain: string;
  /** Distinct answers that cited this domain at least once. */
  answersCiting: number;
  /** Percentage of grounded answers that cited it. */
  sharePct: number;
  /** Which AI surfaces cited it. */
  providers: string[];
  /** A few of the prompts where it appeared, for context. */
  exampleQueries: string[];
};

export type CitationLandscape = {
  /** Answers that actually searched the web. The denominator. */
  groundedAnswers: number;
  /** Answers excluded because the model answered from memory. */
  memoryAnswersIgnored: number;
  yourDomain: string | null;
  /** Grounded answers that cited you. */
  yourAnswersCiting: number;
  yourSharePct: number;
  /** Everyone else, most-cited first. */
  competitors: CitationSource[];
  confidence: "none" | "low" | "usable";
  note: string;
};

/**
 * Reduce a URL to the domain worth grouping on.
 *
 * `www` is dropped because www.example.com and example.com are the same
 * publisher. Deeper subdomains are kept: docs.stripe.com and
 * stripe.com being cited are different facts, and flattening them would
 * hide which part of a competitor's site is winning.
 */
export function citationDomain(raw: string): string | null {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** True when `host` is the site itself or one of its subdomains. */
function isOwnDomain(host: string, own: string | null): boolean {
  if (!own) return false;
  return host === own || host.endsWith(`.${own}`);
}

export function summariseCitations(
  rows: CitationCheckRow[],
  ownDomainRaw: string | null,
): CitationLandscape {
  const own = ownDomainRaw ? citationDomain(ownDomainRaw) : null;

  const grounded = rows.filter((r) => r.grounding === "live");
  const memoryIgnored = rows.length - grounded.length;

  type Acc = {
    answers: number;
    providers: Set<string>;
    queries: Set<string>;
  };
  const byDomain = new Map<string, Acc>();
  let yourAnswers = 0;

  for (const row of grounded) {
    // Distinct domains within this one answer. Citing the same site
    // four times in one response is still one answer that cited it.
    const domains = new Set<string>();
    for (const c of row.citations ?? []) {
      const d = citationDomain(c);
      if (d) domains.add(d);
    }

    let citedYou = false;
    for (const d of domains) {
      if (isOwnDomain(d, own)) {
        citedYou = true;
        continue;
      }
      const acc = byDomain.get(d) ?? {
        answers: 0,
        providers: new Set<string>(),
        queries: new Set<string>(),
      };
      acc.answers += 1;
      acc.providers.add(row.provider);
      if (acc.queries.size < 3) acc.queries.add(row.prompt);
      byDomain.set(d, acc);
    }
    if (citedYou) yourAnswers += 1;
  }

  const denominator = grounded.length;
  const pct = (n: number) =>
    denominator === 0 ? 0 : Math.round((n / denominator) * 1000) / 10;

  const competitors: CitationSource[] = [...byDomain.entries()]
    .map(([domain, acc]) => ({
      domain,
      answersCiting: acc.answers,
      sharePct: pct(acc.answers),
      providers: [...acc.providers].sort(),
      exampleQueries: [...acc.queries],
    }))
    .sort((a, b) => b.answersCiting - a.answersCiting || a.domain.localeCompare(b.domain));

  // Thresholds chosen so the tool won't narrate a pattern it cannot see.
  // Ten grounded answers is still thin, but it is enough to notice a
  // domain appearing repeatedly rather than once by chance.
  const confidence: CitationLandscape["confidence"] =
    denominator === 0 ? "none" : denominator < 10 ? "low" : "usable";

  let note: string;
  if (denominator === 0) {
    note =
      memoryIgnored > 0
        ? `None of the ${memoryIgnored} checks searched the web — every answer came from the model's training memory, which says nothing about what AI search cites today. Re-run with a provider that has web search enabled.`
        : "No AI visibility checks have been run for this site yet.";
  } else if (confidence === "low") {
    note = `Based on ${denominator} grounded answer${denominator === 1 ? "" : "s"}. Too few to call a pattern — treat the ranking below as a first look, not a share of voice.`;
  } else {
    note = `Based on ${denominator} answers where the model actually searched the web${memoryIgnored > 0 ? `; ${memoryIgnored} memory-only answers were excluded` : ""}.`;
  }

  return {
    groundedAnswers: denominator,
    memoryAnswersIgnored: memoryIgnored,
    yourDomain: own,
    yourAnswersCiting: yourAnswers,
    yourSharePct: pct(yourAnswers),
    competitors,
    confidence,
    note,
  };
}
