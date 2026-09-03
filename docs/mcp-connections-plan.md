# Plan: MCP connections, in both directions

## First, a correction to the premise

The ask was: *let users connect their existing Claude / ChatGPT / Google
subscription instead of pasting an API key.*

**For inference, that isn't possible, and it isn't an MCP problem.** It's
billing policy:

- ChatGPT Plus and Pro **do not include** OpenAI API access. They are
  separate products on separate billing.
- Claude Pro can't be used for programmatic inference either. Only Claude
  Max with purchased credits has an OAuth path, and it is not something a
  third-party app can rely on.
- Gemini's consumer subscription is likewise not the Gemini API.

So no amount of MCP work lets *our app* borrow someone's chat subscription
to run its own AI features. Anyone promising that is wrong, and we should
not build a connection screen that implies it.

**But the thing people actually want is achievable, just pointed the other
way round.** MCP is now supported on Claude (all tiers), ChatGPT Plus/Pro/
Business/Enterprise, Perplexity Pro/Max, Grok paid, and Mistral Le Chat.
Those users can connect *to* our tool and do SEO work inside a chat they
already pay for — their subscription does the thinking, our app supplies
the data and the actions. That path needs no API key from them at all.

That reframing is the plan.

---

## Where we are

We shipped an MCP server today with ten tools. It is **stdio only**, which
means it works with Claude Code, Claude Desktop and Cursor — anything that
spawns a local process. It cannot be used by claude.ai in a browser, by
ChatGPT's connectors, or by Perplexity, because those need a **remote**
server.

Everything needed for the rest is already in the SDK we installed:

- `server/webStandardStreamableHttp.js` — Web-standard Request/Response,
  which is exactly what a Next.js route handler takes
- `server/sse.js` — the older transport, still what some clients speak
- `server/auth/` — OAuth helper pieces
- `client/{stdio,sse,streamableHttp}.js` — the outbound direction

We also already have working Google OAuth (`/api/google/auth`,
`/api/google/callback`) for Search Console, so the OAuth patterns and the
encrypted-token storage exist.

---

## Phase 1 — Remote MCP server, so subscriptions can connect

**Goal:** a user with Claude Pro or ChatGPT Plus adds our install as a
connector and asks "why did this page drop last month" in their own chat.

- Add a Next.js route (`/api/mcp`) using the Web-standard Streamable HTTP
  transport, reusing the tool definitions in `src/lib/mcp/tools.ts`
  verbatim. The tools do not change; only the transport does.
- Keep the stdio entry point. Local clients are better served by it and it
  has no network surface.
- Add SSE alongside Streamable HTTP only if a client we care about still
  requires it — check before building it.

**Auth is the whole risk here.** The stdio server needed none, because
running the process already proved you own the machine. A remote endpoint
is reachable from the internet and exposes `run_agent`, which edits live
websites.

- OAuth 2.1 with PKCE, per the MCP spec. The app is the resource server.
- Reuse the existing session/account model rather than inventing a second
  identity system — the same mistake the agent's autonomy levels exist to
  avoid.
- Per-connection scopes: read-only by default. Writing must be opt-in per
  connection, and must still respect autonomy levels, per-run and per-day
  caps, and the recorded undo. A connector must never be able to exceed
  what the scheduler could do.
- Rate limit per connection.
- The endpoint stays **off unless enabled**. A self-hoster who never wants
  a public MCP endpoint should not have one.

**Verification:** extend `scripts/mcp-check.ts` to run the same assertions
over HTTP as it does over stdio, plus: an unauthenticated request is
refused, a read-only token cannot call `run_agent`, and an expired token
fails closed. Then point a real client at it — that is the step that has
caught every serious bug in this codebase, including today's.

## Phase 2 — MCP client, so the app can use other people's servers

**Goal:** the app pulls data from MCP servers the user already has, instead
of us writing an integration per vendor.

- A connections screen: add a server by URL (remote) or command (local),
  list its tools, enable the ones you want.
- Store credentials with the same AES-256-GCM encryption used for API keys.
- Surface results through the existing provenance vocabulary — a number
  from a third-party MCP server must say so, exactly as GSC and scrape data
  already do. This matters more here than anywhere: the data is not ours
  and we cannot vouch for it.
- Obvious first targets: a Search Console MCP server, DataForSEO/Ahrefs for
  users who have them, and a filesystem server for log analysis.

**Risk to name up front:** a third-party MCP server returns text that goes
into a prompt. That is untrusted input reaching a model that can trigger
writes. Treat every tool result as data, never as instructions, and never
let a client-side result decide whether a write happens.

## Phase 3 — Reduce API-key friction where it is actually possible

Not everything needs a key, and we should be honest about which does.

- **Ollama** is already supported and is the genuine zero-key path. Make it
  the first option on the AI settings screen, not a footnote.
- **OAuth where a provider genuinely offers it** — verify per provider
  rather than assuming; most LLM APIs are key-only by design.
- **Say plainly on the screen** that a ChatGPT or Claude subscription is not
  an API key, and point those users at Phase 1 instead. That sentence will
  save more support time than any feature here.

---

## Order, and why

1. **Phase 1** first. It is the only one that delivers the original ask —
   use what you already pay for — and it is the strongest differentiator
   we have: an SEO MCP server backed by a full history that can also act.
2. **Phase 3** next. It is small, mostly copy, and stops people believing
   something untrue.
3. **Phase 2** last. Genuinely useful, but it adds attack surface and
   depends on other people's servers being worth connecting to.

## What would make me stop and rethink

If the remote endpoint cannot be made safe enough to expose `run_agent`,
ship Phase 1 read-only and say so. A connector that can read a client's
audit history is still worth having. One that can quietly edit a live
website through a token someone pasted into a chat is not.

---

# Which features work on a subscription, and which need a key

## The rule, in one line

**A subscription connection works when you are there. An API key works when
you are not.**

With MCP, the thinking happens inside your Claude or ChatGPT window. Our app
supplies data and carries out actions. Nothing happens unless you are in a
chat asking for it.

With an API key, our app can think on its own, at 3am, with nobody watching.

Everything below follows from that one difference.

## Works on your subscription alone — no API key

Anything where you ask and their model reasons over our data.

- Every read: clients, health scores, audit findings, rank history with its
  sources, AI-citation data, the citation landscape, what the agent changed
- Asking questions across the joined history — "why did this page drop last
  month" needs the audit *and* the ranks *and* the change log together, which
  is the thing a single-API connector cannot answer
- Running an audit and interpreting it. The crawl itself is rule-based — 52
  checks, no model involved — so it runs perfectly well with no key at all.
  Their chat then explains and prioritises the findings
- Undoing anything the agent did
- Generating a report's data. Only the executive summary needs writing, and
  their model can write it

## Needs an API key — our app has to think unattended

- **The daily agent and the autonomous agent.** They run on a schedule with
  nobody present. There is no chat window to borrow.
- **Scheduled reports and the weekly digest**, for the same reason
- **Page-monitor alerts** that interpret what changed
- **The ~36 in-app AI tools** — blog writer, content briefs, meta-rewrite in
  bulk, schema generation, traffic-drop analysis, GEO SWOT, competitor
  playbooks, outreach personalisation. These are buttons in our UI that
  produce text, so our app must be able to produce text.

## The gap worth closing

Right now `run_agent` over MCP with no API key **does nothing useful**. It
plans the work and then skips every action, because drafting a title calls
our own model:

    if (needsDraft && !has(capabilities, "generate_text")) skipped++

That is the single most valuable thing to change. The fix is to let the
client's model do the drafting and hand us the words:

1. `list_proposed_fixes` — we return what needs changing and why
2. Their Claude or ChatGPT writes the new title, description or alt text
3. `apply_fix(actionId, newValue)` — we validate it against the same rules
   (length limits, no "Image of…"), write it, verify by reading the page
   back, and record the undo

Every guard stays on our side, so a model that returns a 95-character title
is refused exactly as it is today. The only thing that moves is *where the
words come from*.

That converts the agent, content briefs, executive summaries and schema
generation from "needs a key" to "works on your subscription".

---

# Onboarding: how to say this

Two paths, presented as a choice rather than a fallback. Neither is the
"real" one.

## Screen copy

> **How should the AI work?**
>
> **Connect a subscription you already pay for** — Claude, ChatGPT,
> Perplexity or Mistral.
> You do the SEO work inside a chat you are already in. Ask questions about
> your sites, get findings explained, approve fixes. Nothing extra to pay.
> *Works while you are there.*
>
> **Add an AI key** — Gemini and Groq have free tiers.
> The tool works on its own: audits overnight, the agent fixes what it finds,
> reports write themselves, alerts arrive before you notice the problem.
> *Works while you are not.*
>
> **Both, if you like.** They are not alternatives — a subscription is how you
> work with the tool, a key is how the tool works without you.

Then, immediately below, the sentence that prevents the commonest wrong
assumption:

> A ChatGPT Plus or Claude Pro subscription is **not** an API key — those are
> separate products and separate billing. Connecting your subscription lets
> you *drive* this tool from your chat; it does not let this tool run AI on
> your behalf.

## What to show, when

- **No connection at all:** the tool is still genuinely useful — every audit,
  the 52 checks, rank tracking, reports without the written summary. Say that
  rather than blocking the UI.
- **Subscription only:** grey out nothing. Where a feature needs a key, say
  which one and why — "this writes text on a schedule, so it needs a key" —
  and offer the free Gemini/Groq path in the same sentence.
- **Key only:** mention the connector once. Someone paying for Claude should
  know they can drive this from it.

## The honesty test for this screen

Every claim on it should survive a user checking. No implication that a
subscription replaces a key for background work; no implication that a key is
required for things that plainly are not, like crawling a site.

---

# Modes: what to show, and what not to hide

The instinct was two modes that each show "the tools that work in this mode".
Measuring first changes the design, because the split is not where it looks.

## What the numbers actually are

Counted from `src/app/tools`:

- **58 of 96 tools need no AI whatsoever.** Crawlers, validators, generators,
  checkers — robots.txt, hreflang, redirects, schema validation, CWV, sitemap,
  link checker, security headers. These work identically with nothing
  connected at all.
- **38 tools generate text**, so they need a model somewhere.
- Every one of those 38 is **user-initiated** — you open the page and press a
  button. None of them run unattended.

That last point matters more than the other two. If a person is present and
pressing a button, their chat can do the writing. So with the `apply_fix`
pattern from the previous section, **all 38 could work on a subscription**.

The things that genuinely cannot are not tools at all. They are the seven
background jobs in `scheduler.ts` — the daily agent, the autonomous agent,
scheduled reports, page monitoring, the weekly digest. Nobody is present, so
there is no chat to borrow.

## So the split is not across the tool grid

It is between **the tools** (all of which can work either way) and **the
automation** (which needs a key, always).

Presenting it as "API mode vs MCP mode, each with its own tool list" would
teach users something untrue: that connecting a subscription costs them 40%
of the product. It doesn't. It costs them the *unattended* part.

## Recommended design

**Detect the mode, don't make people choose it.** The state is simply what is
connected: nothing, a subscription, a key, or both. Asking someone to pick a
mode before they understand the difference is asking them to guess.

**Never hide a tool because of the mode.** Badge it instead:

| Badge | Meaning | Count |
|---|---|---|
| *(no badge)* | Works right now, connect nothing | 58 |
| **Uses your chat** | Their model writes; we validate and apply | 38 |
| **Needs a key** | Runs without you — the 7 background jobs | — |

A badge tells the truth and keeps the product's real size visible. Hiding
does neither.

**Offer filtering as a choice, not a mode.** One checkbox — "only show what
works with what I've connected" — off by default. Users who want the smaller
list can have it; nobody is shown a smaller product by default.

**Put the honest headline on the connection screen:**

> Connected nothing: **58 tools work now.**
> Connected a subscription: **all 96 work while you're here.**
> Added a key: **the tool also works while you're not** — overnight audits,
> the agent, reports and alerts.

## Build order this implies

1. `apply_fix` / hand-me-the-text tools over MCP. Without them "uses your
   chat" is a promise we cannot keep, and the badge would be a lie.
2. The badges, driven by one list of which tools need text — derived from the
   code, not hand-maintained, or it will drift like the four finding-name
   lists did.
3. The optional filter.

Do not ship the badges before step 1.

---

# Final answer: MCP, API, or both

## Three independent things, not one

Every tool has three properties, and they are unrelated to each other. Mixing
them up is what makes this look complicated.

| Property | Count | What it means |
|---|---|---|
| **Needs text written** | 38 of 96 | A model has to produce words |
| **Needs a browser** | 7 of 96 | Headless Chromium — SERP scraping, rank position, screenshots, JS rendering |
| **Runs unattended** | 0 of 96 | No tool does. Only the 7 background jobs do. |

Browser-dependent tools: `browser-agent`, `external`, `rank-where`, `render`
(browser only), plus `attack-briefs`, `keyword-difficulty`,
`screenshot-import` (browser **and** AI).

**The browser dimension is irrelevant to this decision.** Chromium runs
inside our app either way — a chat cannot scrape a SERP for us, and it does
not need to. Whether you connect a subscription or a key changes nothing
about those seven. They need our app running, which it always is.

## So the verdict

**MCP will work for the whole tool grid. All 96.**

- 58 tools need no model at all — they already work with nothing connected.
- 38 need words. Every one is user-initiated, so the words can come from your
  chat, provided we build the hand-me-the-text tools.
- 7 need a browser, which is ours regardless.

**API keys are required for exactly one thing: working while you are not
there.** The seven scheduled jobs — daily agent, autonomous agent, scheduled
reports, page monitor, weekly digest. That is the entire difference.

## The honest one-liner for onboarding

> Connect your Claude or ChatGPT subscription and every tool works.
> Add an AI key as well, and the tool keeps working overnight.

## What has to be true for that to be honest

The claim "all 96 work on a subscription" is **not true today**. It becomes
true when the client's model can supply text. Until then, the 38 need a key
and we must say so.

That makes the build order non-negotiable:

1. **`apply_fix` and friends** — MCP tools that accept text from the client
   and validate it on our side. Without this, the headline is a lie.
2. **Remote MCP server** (Streamable HTTP + OAuth 2.1) so claude.ai and
   ChatGPT can connect at all, not just Claude Code and Cursor.
3. **Badges**, derived from the code — "uses your chat", "needs a browser",
   "needs a key" — never hand-maintained.
4. **Onboarding copy**, only once 1-3 are real.

## What I would not claim

- That a subscription replaces a key for background work. It cannot, ever.
  Nobody is in the chat at 3am.
- That the browser tools are affected by any of this. They are not.
- That any of it works before it has been run against a real client. Every
  serious bug in this project has surfaced the first time something actually
  executed, including two today.
