---
name: seo-client-setup
description: "Establish what a client's business actually is and record it, so every later keyword, title and report is grounded in it instead of guessed at."
---

# Set up what we know about a client

## Goal

Find out what this business sells and who it sells to, confirm it with
the user, and write it down. Ten minutes here removes a whole class of
wrong answer from everything that follows.

## Why this exists

Three parts of the tool used to work this out independently and
disagree. The niche dropdown said "local". The site said manufacturer.
The title drafter, seeing a title tag that read "Home Page" and nothing
else, proposed a headline for a mobile game that shared two words with
the company name. The model was not malfunctioning: nobody had told it
anything, and a model with no facts and a required output produces
plausible ones.

## Tools

- `list_clients` — ids. Everything else takes one.
- `get_client_knowledge` — what is already known, and who said it.
- `update_client_knowledge` — write what you confirm.
- `log_client_research` — note what you looked into.
- `get_client_overview` — whether there is an audit, Search Console, a CMS.

## Workflow

1. `get_client_knowledge` first, always. If `confirmedByAPerson` is
   already filled in, this has been done — read it, check it still
   matches the site, and stop unless something is wrong.

2. Read `readFromTheSite`. The tool reads the client's navigation, page
   titles, headings and Product schema during keyword discovery, and
   `products` is what it found with a confidence on each. 45 and above
   means more than one part of the site agreed; below that it appeared
   once, in one place. Treat the low-confidence ones as leads, not facts.

3. If `readFromTheSite` is null, nothing has read the site yet. Fetch the
   homepage and two or three pages the navigation points at, yourself.

4. Work out three things and **confirm each with the user before writing
   it**:

   - **What the business sells.** Name the actual products or services in
     the words the site uses for them, not a category.
   - **Who it sells to.** Trade or retail is the one that changes the most
     downstream. A manufacturer's buyers do not search "near me"; a
     bakery's customers do.
   - **Which pages matter.** Usually the homepage and the top two or
     three commercial pages.

5. Write it with `update_client_knowledge`. Omitted fields are left
   alone, so you can do this in two passes. Write what the user
   confirmed, not what you inferred — the whole value of this store is
   that a stated fact and a guess stay distinguishable.

6. `log_client_research` with one line saying what you checked.

## What not to do

- **Do not write an inference as a confirmed fact.** If the user has not
  said it, either ask or leave it out. A wrong `businessOverview` is
  worse than an empty one: it is read by the title drafter, the keyword
  seeder and every report, and nobody re-checks it.
- **Do not interview the user for twenty minutes.** Three questions. The
  rest can be corrected later.
- **Do not paste the whole `products` list into `businessOverview`.**
  That field is a sentence or two about the business. The product list is
  already stored, with its provenance.

## Output

Tell the user, in three or four lines: what you recorded, which parts
they confirmed versus which came off their site, and what it will change.
Then say which skill to run next — `seo-fix-pass` if the site has open
problems, `seo-keyword-plan` if it does not.
