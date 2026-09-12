# seo-tool skills

Four skills that drive this tool's MCP server from Claude Code, Claude
Desktop or Cursor.

## Connect the server first

This plugin deliberately ships **no `mcp.json`**. Every install of this
tool runs on its own machine, on its own port, with its own token, so a
committed config file would be wrong for everybody. Settings → MCP in
the app prints the exact command for your install — run that, then these
skills have something to talk to.

Check it worked by asking for `list_clients`. If it answers, you are
connected.

## The skills

| Skill | Use it when |
|---|---|
| `seo-client-setup` | A client is new, or the tool keeps guessing what the business does |
| `seo-fix-pass` | You want problems actually fixed on the live site, not listed |
| `seo-audit-report` | Somebody needs a readable account of where a site stands |
| `seo-keyword-plan` | Deciding what to target, grounded in what the site sells |

Start with `seo-client-setup` on any client you have not used before.
The other three read what it writes, and all of them get worse without
it.

## What makes this one different

Most SEO integrations are read-only: they fetch numbers and hand them
over. This one can change the site. `seo-fix-pass` drafts a title,
validates it against the same rules the tool applies to its own drafts,
writes it through the CMS, reads it back to confirm it took effect, and
records an undo.

That also means it can get it wrong on a live website, which is why the
autonomy level, the per-run and per-day caps and the recorded undo are
not optional and cannot be raised from here.
