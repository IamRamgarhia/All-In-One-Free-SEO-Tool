# Claude Code on your tasks

Clients whose site is a local project (Astro, Next.js, plain HTML) have no CMS for the tool to write through. For them, Claude Code does the work in the project folder, and you watch it from the app.

This only works when you use the app on the computer that runs it, signed in as the owner. Claude edits files and runs commands there, so every route refuses anything else.

## Off by default

Nothing below runs until you turn it on, in **Settings → Claude Code on this computer** or with `SEO_TOOL_HOST_AGENT=1` in the environment. While it is off the routes answer `403`, the Claude dock is not drawn, the autopilot skips clients that Claude Code would work, and nothing is spawned. `SEO_TOOL_HOST_AGENT=0` is a hard off that the Settings page cannot undo; put it in the `.env` or Dockerfile of any install other people can reach.

### What runs on the host

When it is on, the app starts these programs on the machine that runs it, with arguments passed as an array (no shell):

| Program | When | Where |
| --- | --- | --- |
| `claude -p` | A task chat message, a queue run, the autopilot | The client's local project folder |
| `git` | Branch, commit, push, in the pull-request modes | The same folder |
| `gh` | Open, list, merge pull requests; list your repositories | The client's repository |
| `osascript` / PowerShell / `zenity` | The folder picker; Open in Claude | Opens a window on the host's screen |

They run as the operating-system user that runs the app, with that user's `claude` login and `gh` login, and `claude` may edit files in the project folder and run the commands listed in `src/lib/task-chat/workflow.ts`. The app stores no GitHub token. Anyone who can sign in to the dashboard (the owner account, or the shared password) can start them, which is why the routes also refuse any request that does not come from the same computer, and why this is off until you say otherwise.

## Set up a client

On **Clients → Edit**:

| Field | What it does |
| --- | --- |
| Local project folder | Where Claude works. Chats start in this folder. |
| GitHub repository | `owner/name`. Pick from your repos (uses the `gh` sign-in; the app never stores a token). |
| Base branch | The branch pull requests target (default `main`). |
| Pull-request mode | `Edit files only`, `Open a pull request`, `Open and merge`, or `One pull request per run`. |

Install and sign in to the [`claude`](https://docs.claude.com/en/docs/claude-code) CLI and, for pull requests, the [`gh`](https://cli.github.com) CLI (`gh auth login`).

## Working a task

- **Open in Claude** on a task, or the **Claude** button at the bottom right of every page (the dock). Chats stay open across pages and keep running when the window is minimized.
- Claude reads the task through the `seo-tool` MCP (`get_task`), works in the folder, and marks it done with `update_task`.
- The conversation is saved and resumable. Send more messages to steer it.
- `Tab` takes Claude's suggested reply, like in the terminal.
- **Move to next task ▸** (when Claude is idle) goes on with the client's other open tasks, highest priority first, and opens the next chat.

### Pull-request modes

| Mode | What Claude does per task |
| --- | --- |
| Edit files only | Changes the files. Git is left alone. |
| Open a pull request | Branch `seo/task-<id>-…`, commit, push, `gh pr create`. Stops there for you to review. |
| Open and merge | The same, then waits for the checks and merges (`--squash --delete-branch`) only when local checks and every PR check are green. After two failed attempts it leaves the PR open and says why. |
| One pull request per run | Inside a queue run: every task is committed on one branch (`seo/batch-<date>`) and Claude never pushes. When the run ends, the app pushes once and opens a single pull request listing the tasks. One preview and one production deploy for the whole run. Outside a run (a single chat) it behaves like `Open a pull request`. |

Never allowed, whatever the mode: force-push, pushing to the base branch, deleting branches, `git reset`, `git clean`. The allow and deny lists are in `src/lib/task-chat/workflow.ts`.

### Merging the pull requests from the app

With `Open a pull request` or `One pull request per run`, **Tasks** lists the open pull requests Claude made for the client (branches `seo/task-<id>-…` or `seo/batch-…`) under the queue bar, each with its check state and a **Merge** button, plus **Merge all (N)**. A pull request is merged (squash, branch deleted) only when it has no conflicts, is not a draft, and every check is green; the state is read again right before each merge. "Merge all" goes oldest first and reports any that no longer merge after the base branch moved.

Why this helps with hosting builds: Cloudflare Pages (or Vercel) builds a preview for every pushed branch and a production build for every push to the base branch. Merging when you decide, instead of merging after each task, keeps production builds to the moments you choose. Each merge still triggers one production build; to build only once, merge fewer, larger changes, or limit preview builds to selected branches in the host's settings.

### Model and effort

At the bottom of every chat there are two lists: the **model** (Claude's default, Fable, Opus, Sonnet, Haiku) and the **effort** (default, low, medium, high, xhigh, max). They are saved for the whole workspace and apply from the next message; a turn already running is not changed. "Default" passes nothing, so Claude Code uses your own settings.

## Run everything

- **Tasks → Run all of <client>'s tasks with Claude → Start queue** works all open tasks of a client, high priority first, one chat each. Nothing closes when a task finishes. A task is tried once per run, and three failures in a row stop the run.
- The queue lives in memory: restarting the app ends the run (finished tasks keep their status and chats).

## Autopilot per client

**Agent → Autopilot → Autopilot per client** sets, for each client:

- the level: follow the workspace, or `Off`, `Suggest only`, `Fix the obvious things`, `Full autopilot`;
- who does the work: pick automatically, WordPress / WooCommerce, or Claude Code (local folder).

Automatic choice: a client with a WordPress connection (`wpEndpoint` + `wpKey`, the bridge) is changed through it; otherwise a client with a local folder is worked by Claude. Nothing in the WordPress path changed.

For Claude clients, the autopilot turns new AI suggestions and audit findings into tasks, then hands them to the queue:

- *Fix the obvious things*: title, meta description and H1 rewrites, and plain "missing" findings (meta description, title, alt text, canonical, social tags, schema).
- *Full autopilot*: every open task.
- The scheduled run (every 6 hours) keeps to "actions per run". **Run now** takes everything and opens the first chat.

Without a GitHub repo in a pull-request mode, Claude edits the files directly; the page warns about it.

## What Claude may run

Headless chats cannot ask for permission, so anything not listed is refused. Allowed: reading and editing files in the folder, `git status/diff/log`, the project's `build`/`lint`/`test` scripts, `WebFetch`, `WebSearch`, the `seo-tool` MCP, and (per mode) the git and `gh pr` commands above. Documents that are not part of the site (email drafts, prospect lists, reports) are written to `.seo-drafts/task-<id>/` next to the app, not into the client's repository, so they are never committed or deployed. Chats are told not to add `Co-Authored-By` or "Generated with" lines to commits and pull requests.

## Troubleshooting

- **429 "Too many requests on this token"**: the MCP endpoint allows 600 requests a minute per token, shared by every chat. Chats wait and retry; refusals are logged as `[mcp] rate limited …`.
- **"Run was interrupted"**: the app restarted while Claude was working. Send a message to continue.
- **Chat says the folder is missing**: set the Local project folder on the client's Edit page.

## Ideas for later

The runner (`src/lib/task-chat/runner.ts`) is the only place that knows about the `claude` CLI: it spawns the process, feeds the prompt, and turns its JSON stream into chat events (`events.ts`). Supporting other coding agents means giving that file a second implementation behind a small interface:

- **Other agents**: Cursor (`cursor-agent`), OpenCode, Codex CLI, Gemini CLI. Each needs an adapter for starting a turn, resuming a session, listing allowed tools, and parsing output into the existing event kinds. A per-client or per-workspace "agent" setting would choose which one.
- **Per-client model and effort**, and a cost cap per run (the dock already shows cost per chat).
- **A queue that survives restarts**, stored in the database instead of memory.
- **"Changes per day" for the Claude path**, matching the WordPress guardrail.
- **Review before merge** by a second pass, or by a person, for `pr_merge` clients.
- **Branch previews** (Cloudflare Pages, Vercel): show the preview link on the task.
