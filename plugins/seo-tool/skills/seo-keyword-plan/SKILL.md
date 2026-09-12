---
name: seo-keyword-plan
description: "Decide what a site should target, grounded in the words it uses for what it sells rather than in what its name sounds like."
---

# Plan what to target

## Goal

A short list of things this site can realistically rank for, each tied to
a page that exists or a page worth making.

## The failure this exists to prevent

A web agency called Dice Codes was seeded into Google autocomplete on its
own name. It came back with "dice codes discount", "dice discount code
nhs" and "dice codes for monopoly go" — a ticketing app and a mobile
game. Sixty keywords, every one about somebody else's business, and the
tool offered to track twelve of them.

A business that needs SEO help is by definition one nobody searches for
by name. Its name is the least useful seed it has. What it sells, and
where, are the useful ones.

## Tools

- `get_client_knowledge` — what the site calls its own products, with a
  confidence on each. Start here.
- `get_keyword_rankings` — what is already tracked and where it sits.
- `get_client_overview` — whether Search Console is connected.
- `list_audit_issues` — whether the target pages are even indexable.
- `update_client_knowledge` — record the pages you decide matter.
- `log_client_research` — what you concluded.

## Workflow

1. `get_client_knowledge`. The `products` list is what the tool read off
   the client's navigation, page titles, headings and Product schema. Use
   45-and-above as your starting vocabulary; those are terms more than
   one part of the site agreed on.

   If it is empty or the note says the site could not be read, stop and
   run `seo-client-setup`. Planning keywords for a business you cannot
   describe is guessing.

2. Check `confirmedByAPerson` for who the site sells to. Trade or retail
   changes everything: nobody sourcing industrial tape types "near me",
   and a bakery's customers type little else.

3. `get_keyword_rankings`. Anything already in positions 4-15 is worth
   more than a new target — it is most of the way there.

4. Propose one theme and three to five specific keywords. For each:
   - the exact phrase, in the site's own vocabulary
   - the page that should rank for it, or that it needs
   - why this site can plausibly win it

5. Check the target pages are indexable before recommending work on them.
   `list_audit_issues` will say if they are noindexed, canonicalised
   elsewhere or blocked.

6. `update_client_knowledge` with the pages you settled on, and
   `log_client_research` with the theme you picked.

## Rules

- **Never propose the brand name as a target.** It is navigational and it
  is what produced the Monopoly Go list.
- **Stay inside what the site sells.** If the vocabulary says industrial
  tape, do not propose hobby or retail searches. Extend the range; do not
  invent a different one.
- **Do not invent volume or difficulty numbers.** This install has no
  paid keyword data. Say "I cannot see volume for these" rather than
  producing a figure, and say what you judged instead: intent, how
  specific the phrase is, whether the site already ranks nearby.
- **Prefer the specific.** A five-word phrase a buyer types beats a
  one-word category this site will never rank for.

## Output

The theme, then the keywords as a short list with the page for each, then
one line on what you could not see and why. Do not pad it into a
strategy document.
