---
name: seo-task-runner
description: "Pick up an SEO task from the tool's to-do list, do it inside the client's own project folder (Astro, Next.js, any local repo), and mark it done."
---

# Do an SEO task in the client's project

## Goal

Take one task from the tool's list and finish it where the site's source
lives, instead of describing what someone should do. Use this when the
client's site is a local project (Astro, Next.js, plain HTML) and there is
no CMS for the tool to write through.

## Before you touch anything

Run `list_clients` and find the client's `localPath`. Work in that folder
and nowhere else. If it is null, ask the user where the project is. Do not
search the disk for it.

## Steps

1. `list_tasks` for the client, status `todo`. High priority comes first.
2. `get_task` for the one you are taking. Its `brief` states the site, the
   stack, the folder and where such things usually live. Those locations
   are places to look. They are not facts about this project, so read the
   files before editing.
3. `update_task` to "in progress" if the work will take more than one step.
4. Make the smallest change that completes the task, in the project folder.
   Do not deploy or push unless the user asked you to.
5. Check the result: build the site, open the changed file, or re-read the
   sitemap. Say what you verified.
6. `update_task` to `done`, or `skipped` with the reason if the task does
   not apply to this site. Marking a task done is recorded in the activity
   log, so do not do it for work that is not finished.

## Blog drafts for a static site

If the user wants a generated article in the project, call
`list_publish_queue` (kind blog_draft, status pending_review) and then
`get_queue_item`. It returns a Markdown file with frontmatter. With `forAi`
it also carries a brief on how to enrich it. Save it into the project's
content folder, follow that folder's frontmatter conventions, and keep the
keywords.

## Tools

- `list_clients` — ids and each client's `localPath`.
- `list_tasks` — the to-do list for one client.
- `get_task` — one task plus a ready-made brief.
- `update_task` — set the status. Does not change the live website.
- `list_publish_queue` — generated items waiting for review.
- `get_queue_item` — one item; blog drafts come as Markdown.

## What not to do

- Do not mark a task done because you wrote a plan for it.
- Do not edit generated output such as `dist/` or `.next/`.
- Do not change anything outside the client's folder.
