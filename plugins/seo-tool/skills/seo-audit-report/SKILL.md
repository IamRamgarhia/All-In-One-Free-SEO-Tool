---
name: seo-audit-report
description: "Write a plain-language account of where a site stands, from the crawl, the rankings, the AI-citation checks and the log of what has already been changed."
---

# Report on where a site stands

## Goal

One readable account of a site, built on the joined history this install
already holds, ending in the single thing worth doing next.

## What makes this worth doing here

Most SEO reports are one data source rendered. This install holds crawl
findings, rank movements from two different sources, AI-citation checks,
and a log of every change the agent made to the live site — joined, over
time. "Why did this page drop" needs all of that, which is why the answer
is usually in the agent action log rather than in the rankings.

## Tools

- `get_client_knowledge` — what the business is. Decides which findings
  matter.
- `get_client_overview` — score, open issues by severity, what is
  connected.
- `list_audit_issues` — the findings themselves.
- `get_keyword_rankings` — positions and movement.
- `get_ai_visibility` — whether assistants cite this site.
- `get_citation_landscape` — who they cite instead.
- `get_recent_agent_runs` and `list_agent_actions` — what has already
  been changed, and when.
- `compare_search_periods` — clicks and position against the previous
  period, and what moved, from Search Console.
- `check_indexing` — whether the pages Google shows most are indexed,
  and why not. `inspect_url` for one page, `list_sitemaps` for what was
  submitted. All four need a connected Search Console property and say so
  when there is none.

## Reading the numbers honestly

This is most of the job.

- **A rank from Search Console and a rank from a scrape are different
  measurements.** One is an impression-weighted daily average across real
  searchers; the other is the position this server was shown at one
  moment from one location. Every row says which. Never average them, and
  never report movement between two rows from different sources — the
  tool returns null for that on purpose.
- **An AI-visibility check says whether the model actually searched the
  web.** Only the live ones tell you anything about AI search today. A
  "not cited" from training memory is a statement about the model, not
  about the site.
- **`get_citation_landscape` states its sample size.** A ranking drawn
  from three answers is three answers, not a share of voice. Say the
  number.
- **No audit is not a clean audit.** `get_client_overview` says plainly
  when there is none. Report that, do not report health.
- **Correlate changes with dates.** If rankings moved, check
  `list_agent_actions` for what changed and when before attributing it to
  anything else.
- **Search Console's newest days are unfinished.** `compare_search_periods`
  ends both periods on the last day Google finished counting. Do not
  restate its numbers as "the last 28 days" by the calendar, and do not
  call a partial day a drop.
- **An inspection is Google's record from its last crawl.** A fix made
  this week will not show in `inspect_url` or `check_indexing` until
  Google recrawls the page. Say when the page was last crawled.

## Workflow

1. `get_client_knowledge`, then `get_client_overview`.
2. Pull the findings, the rankings and the AI checks. If Search Console is
   connected, `compare_search_periods` and `check_indexing` too.
3. `get_recent_agent_runs` and `list_agent_actions` for what has already
   been done, so the report does not recommend work that is finished.
4. Verify anything you plan to state about a specific page by fetching
   that page. Report nothing you have not seen evidence for.
5. Decide the one thing worth doing next. Derive it from this data, never
   from generic advice. It has to be doable this week.
6. `log_client_research` with the verdict in one line.

## Output

Written for whoever asked, usually not an SEO.

- Two or three sentences on the overall state, the main gap, and the one
  thing.
- What is wrong, worst first, in plain words. Every technical term
  glossed once.
- What has already been changed, from the action log.
- The one thing, with the mechanics spelled out well enough to act on.
- A short "how we know" line for any number a reader might challenge:
  where it came from and how old it is.

Keep the numbers in a small table or on their own lines. No number goes
in a sentence unless it changes what the reader does.
