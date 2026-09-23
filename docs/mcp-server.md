# Using this tool from Claude, Cursor, or any MCP client

This install can act as an MCP server, so an AI assistant can work
against your own SEO data directly — no exporting, no pasting screenshots
into a chat window.

## Why this one is different

Most SEO MCP servers wrap a single API, usually Search Console. This one
is backed by the store this tool already keeps: crawl findings, rank
history from two different sources, AI-citation checks, and a log of
every change the automated agent made to your live site. It reads Search
Console too, but the point is that it reads it *alongside* the rest.

That matters for the questions people actually ask. "Why did this page
drop last month" needs the rank history *and* the audit *and* what the
agent changed, joined. One API can't answer it.

It can also **act** — and undo what it did.

## Setup

### Local (stdio) — Claude Desktop, Claude Code, Cursor

The client spawns the server as a child process. Nothing is exposed and
no token is used.

Settings → AI connection renders this config with your real install path,
the node binary already running the app, and the local tsx — absolute
paths rather than npx, which is what makes it work on Windows. Copy it
from there, or adapt:

```json
{
  "mcpServers": {
    "seo-tool": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/this/repo/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/this/repo/scripts/mcp-server.ts"
      ],
      "cwd": "/absolute/path/to/this/repo",
      "env": {
        "SEO_DB_PATH": "/absolute/path/to/data.db"
      }
    }
  }
}
```

SEO_DB_PATH is optional if you use the default location. Restart the
client afterwards; MCP servers are read at startup.

Check it with `pnpm test:mcp`, which spawns the server and speaks the
protocol to it against a throwaway database.

### Remote (Streamable HTTP)

Off until you turn it on. Settings → AI connection generates a token;
without one the endpoint answers 503.

```
claude mcp add -t http seo-tool http://localhost:PORT/api/mcp -H "Authorization: Bearer YOUR_TOKEN"
```

Check it with `pnpm test:mcp:http YOUR_TOKEN` against a running app.

## What it can do

**Reading**

| Tool | Answers |
|---|---|
| `list_clients` | Which sites are set up here. Start here — everything else takes a clientId. |
| `get_client_overview` | Audit score, open issues by severity, keywords tracked, what's connected. |
| `list_audit_issues` | Technical problems from the latest crawl, filterable by severity and type. |
| `get_keyword_rankings` | Positions and movement over a window, each with its source. |
| `get_ai_visibility` | Individual AI-assistant checks and their citations. |
| `get_citation_landscape` | Which domains get cited for your topics, ranked, with your own share. "Who is being cited instead of me." |
| `list_agent_actions` | What the agent changed, and whether it can still be undone. |
| `get_recent_agent_runs` | Recent agent runs and their summaries. |
| `list_proposed_fixes` | Work queued for a person to approve, with the current value and the rules any replacement has to satisfy. |
| `get_client_knowledge` | What this install knows about the business, and whether a person or a site read established it. |
| `get_review_backlog` | Business Profile reviews, which still need an answer, and which replies came from here rather than Google's own app. |

**Reading Search Console.** Needs a connected property. Read-only, because
the Google connection only holds the read-only scope — this install cannot
submit or delete a sitemap.

| Tool | Answers |
|---|---|
| `inspect_url` | Google's index record for one URL: indexed or not and why, the canonical Google chose against the one the page declares, robots and fetch state, rich-result issues, last crawl. |
| `check_indexing` | Inspects the pages with the most impressions over 30 days and sorts them by cause — not indexed, robots.txt, noindex, fetch problems, canonical overridden. Each page uses one of the property's 2,000 daily inspections. |
| `compare_search_periods` | Two back-to-back periods with the queries or pages that gained and lost the most clicks. Both end on the newest day Google has finished counting, so a part-counted day cannot read as a drop. |
| `list_sitemaps` | Sitemaps submitted, when Google last read each one, errors, warnings and URLs submitted. |

**Acting**

| Tool | Does |
|---|---|
| `run_agent` | Asks the agent to work on a site now. |
| `apply_fix` | Supplies the text for one queued fix. Validated against the same rules, written, then verified by reading the page back. |
| `revert_agent_action` | Undoes one change, restoring the previous value. |
| `update_client_knowledge` | Records what you established about the business, attributed to whoever established it. |
| `log_client_research` | Notes what has already been looked into, so the next session does not repeat it. |
| `save_review_draft` | Stores a reply for a person to approve. Sends nothing. |
| `reply_to_review` | Publishes a reply on Google, under the business's name. Public, and cannot be withdrawn — only replaced. |

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

The citation landscape applies the same rule harder. It counts **only**
answers where the model searched the web, because a memory answer
describes what that model absorbed in training — it is not evidence about
what AI search cites today, and averaging the two produces a number that
describes neither. It also states its sample size: a ranking drawn from
three answers is labelled as too small to call, rather than presented as
a share of voice.

**It won't let an assistant edit your site directly.** There is no
`set_title` tool. Changes go through `run_agent` and `apply_fix`, which
means your autonomy setting still decides what happens:

- **suggest** (the default) — changes are proposed for you to approve.
  Nothing is written to the live site.
- **apply_safe** — mechanical fixes apply automatically; judgement calls,
  including anything that edits article text, are queued for review.
- **apply_all** — everything applies, including content edits.

The response always states which level was in force and what it meant, so
`applied: 0` reads as "your settings said not to" rather than a fault.
Per-run and per-day caps, cooldowns and the recorded undo all still apply.

`apply_fix` is the one path where the words come from your assistant
rather than from this app's own model. It still has to pass the same
validation, and a replacement that breaks a rule is refused without
consuming the fix.

This is deliberate. A second permission system would be a second thing to
get wrong, on the one path that edits live websites.

## Security

The two transports have different exposure.

**stdio.** The client spawns the server as a local process — there is no
port and nothing listening. It runs as whoever owns the database file,
which is the person already allowed to read it.

**The remote endpoint** at `/api/mcp` exists so connectors and chat
clients can attach, and it is off until you generate a token. After that:

- every request needs an Authorization Bearer header; anything else gets
  a 401
- a browser request from another origin is refused, which the transport
  spec requires — otherwise a page you have open could reach a server
  running on your own machine
- it is only reachable from the internet if you expose it yourself, for
  example through a tunnel

There is no OAuth here. It is a static bearer token, so the 401 does not
advertise an authorization server that does not exist. Clients that can
send a header (Claude Code, Cursor, Claude Desktop) can connect; a client
that only offers an OAuth sign-in cannot. Treat the token like a
password: it is the only thing in front of an endpoint that can ask the
agent to run. Revoke it when you are done, and stop the tunnel.

## Troubleshooting

**"Server disconnected" straight away.** Usually cwd is wrong or
dependencies aren't installed. Run `pnpm install` in the repo, then
`pnpm test:mcp` to see the real error.

**503 from the remote endpoint.** No token has been generated yet —
Settings → AI connection.

**401 from the remote endpoint.** The token in your client's header does
not match the one stored here. Generating a new token invalidates the old
one.

**Errors mentioning a missing table.** Run `pnpm db:migrate`.

**Tools don't appear.** Restart the client — the server list is only read
at startup.
