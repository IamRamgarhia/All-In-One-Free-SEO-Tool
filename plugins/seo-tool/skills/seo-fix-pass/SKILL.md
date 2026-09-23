---
name: seo-fix-pass
description: "Fix what the crawler found on a live site: draft the copy, apply it through the CMS, confirm it took effect, and undo anything that came out wrong."
---

# Fix a pass of what the crawler found

## Goal

Turn open findings into changes that are live on the site, or into an
honest account of why they are not. This is the skill that changes
something. Everything else in this plugin reads.

## Before you touch anything

Run `get_client_knowledge`. Rewriting a title without knowing what the
business does is how "Home Page" became a headline for a mobile game. If
`confirmedByAPerson` is null, stop and run `seo-client-setup` first. It
takes ten minutes and it is the difference between copy that is about
this business and copy that is plausible.

## How writing is gated

You cannot raise the autonomy level from here, and you should not try.

- At the default `suggest` level, nothing reaches the live site. Changes
  are recorded for a human to approve.
- `run_agent` reports which level was in force and what that meant. Read
  that line before telling the user anything was applied.
- Per-run and per-day caps and a cooldown apply. A run that stops early
  has usually hit one, and says so.
- Every applied change records an undo. Reversible is not the same as
  harmless.

## Tools

- `get_client_knowledge` — what the business is. First, always.
- `list_audit_issues` — what the crawler found, by severity and type.
- `run_agent` — plan, draft, and apply what the level permits.
- `list_proposed_fixes` — work the agent decided on but has no wording
  for. Each says what is wrong, the current value, and the rules your
  replacement must satisfy.
- `apply_fix` — your wording, validated, written, read back, undo
  recorded.
- `list_agent_actions` — what changed, before and after, still reversible
  or not.
- `revert_agent_action` — put one back.

## Workflow

1. `get_client_knowledge`, then `list_audit_issues` for the client.
   Critical and high first.

2. `run_agent`. Read the summary it returns rather than assuming: it
   states the autonomy level, what was applied, what was queued, and what
   it refused.

3. `list_proposed_fixes`. On an install with no AI key of its own this is
   where the work is: the tool decided *what* to change from measured
   findings, and you write the words.

4. For each fix, write the replacement yourself, using the business
   context and the page. Then `apply_fix`.

   Your text goes through the same validation the tool applies to its own
   drafts. A title still over the display limit is refused whoever wrote
   it, and a refusal does not consume the fix — fix your text and try
   again.

5. `list_agent_actions` at the end. Check the before and after values
   read the way you intended on the live site.

6. `log_client_research` with one line: what you fixed and what you left.

## Writing the copy

- Say what the page is. Do not invent offers, prices, guarantees or
  locations that are not in the business context or on the page.
- Do not repeat the brand name if it is already in the title.
- Alt text describes what is in the image for somebody who cannot see it.
  You are usually given only a filename. If it tells you nothing,
  describe the image's role on the page rather than inventing colours,
  counts or expressions.
- Meta descriptions are for a person deciding whether to click.

## When to stop and ask

- The fix would change a URL, a redirect or `robots.txt`. A wrong
  redirect takes traffic off a page and a wrong robots line can deindex a
  site. These are marked for review for that reason.
- More than about ten changes in one pass. Say what you would do and let
  the user approve the batch.
- Anything where you are inventing a fact to fill a gap. That is the
  signal to ask, not to write.

## Output

What changed, on which pages, with the old and new values. Then what you
did not fix and why. Finish with how to undo: `revert_agent_action` and
the action id.
