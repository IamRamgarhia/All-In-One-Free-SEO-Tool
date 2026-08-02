# Using this tool from Claude, Cursor, or any MCP client

This install can act as an MCP server, so an AI assistant can work
against your own SEO data directly — no exporting, no pasting screenshots
into a chat window.

## Why this one is different

Most SEO MCP servers wrap a single API, usually Search Console. This one
is backed by the store this tool already keeps: crawl findings, rank
history from two different sources, AI-citation checks, and a log of
every change the automated agent made to your live site.

That matters for the questions people actually ask. "Why did this page
drop last month" needs the rank history *and* the audit *and* what the
agent changed, joined. One API can't answer it.

It can also **act** — and undo what it did.

## Setup

Add this to your MCP client's config. For Claude Desktop that is
`claude_desktop_config.json`; for Claude Code, `.mcp.json` in your
project or the user-level equivalent.

```json
{
  "mcpServers": {
    "seo-tool": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": "/absolute/path/to/this/repo",
      "env": {
        "SEO_DB_PATH": "/absolute/path/to/data.db"
      }
    }
  }
}
```

`SEO_DB_PATH` is optional if you use the default location. Restart the
client afterwards; MCP servers are read at startup.

Check it works with `pnpm test:mcp`, which spawns the server and speaks
the protocol to it against a throwaway database.

## What it can do

**Reading**

| Tool | Answers |
|---|---|
| `list_clients` | Which sites are set up here. Start here — everything else takes a `clientId`. |
| `get_client_overview` | Audit score, open issues by severity, keywords tracked, what's connected. |
| `list_audit_issues` | Technical problems from the latest crawl, filterable by severity and type. |
| `get_keyword_rankings` | Positions and movement over a window. |
| `get_ai_visibility` | Whether AI assistants cite you, and who they cite instead. |
| `list_agent_actions` | What the agent changed, and whether it can still be undone. |
| `get_recent_agent_runs` | Recent agent runs and their summaries. |

**Acting**

| Tool | Does |
|---|---|
| `run_agent` | Asks the agent to work on a site now. |
| `revert_agent_action` | Undoes one change, restoring the previous value. |

## Two things it deliberately will not do

**It won't hand you a number without saying what it is.** Every rank
carries its source, because a Search Console position and a browser
scrape are different measurements. GSC is an impression-weighted average
across everyone who saw the result; a scrape is one position this server
was shown, once, from one location.

They must not be compared. If the two ends of a window came from
different sources, the movement is reported as `null` with a note saying
why — rather than a confident "up 6 places" that never happened. Audits
and AI checks carry the same treatment: how old, where from, and for AI
visibility whether the model actually *searched* or answered from
training memory.

**It won't let an assistant edit your site directly.** There is no
`set_title` tool. The only way to change anything is `run_agent`, which
means your autonomy setting still decides what happens:

- **suggest** (the default) — changes are proposed for you to approve.
  Nothing is written to the live site.
- **apply_safe** — mechanical fixes apply automatically; judgement calls,
  including anything that edits article text, are queued for review.
- **apply_all** — everything applies, including content edits.

The response always states which level was in force and what it meant, so
`applied: 0` reads as "your settings said not to" rather than a fault.
Per-run and per-day caps, cooldowns and the recorded undo all still
apply.

This is deliberate. A second permission system would be a second thing to
get wrong, on the one path that edits live websites.

## Security

stdio only. The client spawns the server as a local process — there is no
port and nothing listening. It runs as whoever owns the database file,
which is the person already allowed to read it.

There is no HTTP transport on purpose. That would need its own
authentication, and getting that wrong on a process that can edit live
websites is not a trade worth making for convenience.

## Troubleshooting

**"Server disconnected" straight away.** Usually `cwd` is wrong or
dependencies aren't installed. Run `pnpm install` in the repo, then
`pnpm test:mcp` to see the real error.

**Errors mentioning a missing table.** Run `pnpm db:migrate`.

**Tools don't appear.** Restart the client — the server list is only read
at startup.
