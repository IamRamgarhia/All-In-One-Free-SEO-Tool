# Changelog

Each release has full notes under [docs/releases](docs/releases/). This
file is the short version.

## v0.10.3 — 2026-11-20

Everything the first real installation found.
[Full notes](docs/releases/v0.10.3.md)

- **🖱️ The installer told you WebView2 was missing on a computer that
  had it.** It shipped only the exe; `PublishSingleFile` leaves native
  libraries beside it, so `WebView2Loader.dll` was left behind and a
  blanket `catch` turned our packaging bug into an accusation about
  your machine. A missing file of ours now says so plainly.
- **It said "Install" over a copy you already had**, and could not
  close the running app — Inno closes applications by messaging a
  window, and the `node.exe` server has none. Both fixed; it now reads
  the installed version, says it is updating, and closes its own app
  with `taskkill /T`.
- **The wizard wears the app's mark**, generated from the icon at build
  time by a hand-written PNG decoder.
- **🗄️ A first run had no database at all.** The Docker entrypoint
  always ran migrations; the Windows host did not. Health answered 200
  while the first page returned 500, because health does not touch the
  database.
- **And the database was written inside the program folder** — three
  files resolve its path and only one honoured `SEO_DATA_DIR`. It now
  lives in `%LOCALAPPDATA%\SEO Tool`, which the installer always
  claimed.
- **Auto-backup ran every scheduler tick**, because it records "when
  did I last run" inside the database it is backing up.
- **🖥️ The desktop app thought it was a browser.** The host has set
  `SEO_LAUNCHED_BY` since it was written and nothing read it — so the
  installed app offered to install itself as a PWA and to create the
  shortcut that launched it, and "Stop server" told you to open a
  second copy of the app you were looking at.
- **⚡ Faster to a usable screen**, and honest about the rest: the
  server is up in under a second, the remainder is Next's one-time
  init, and it is now spent under the branded splash rather than in
  front of a blank window.
- **🤖 The agent was writing titles blind.** Nothing populated the
  current value, and the drafting prompt reads from that field — which
  is how "Active Dice Codes for Free Rewards" was proposed as a digital
  agency's home-page title. The planner now reads the live page first.
- **Fixed:** a CDN made working fixes look like they had not applied; a
  WordPress static home page could never be resolved; the plugin's key
  field showed 43 of 48 characters; the dot legend appeared twice; the
  client page put the client third.
- **No migrations.** Schema unchanged at 76. WordPress plugin 0.6.1 →
  **0.6.2** — the home-page fix needs it.

## v0.10.2 — 2026-11-19

An installer you can double-click, and an agent that finishes what it
starts. [Full notes](docs/releases/v0.10.2.md)

- **🖱️ A Windows `.exe` and a macOS/Linux one-liner.** Neither existed
  before — the only install was `git clone` plus a build, which asks
  for pnpm, a C++ toolchain and a working `main`. The prebuilt payload
  ships `node_modules` and `.next` already built, one per platform
  **and per Node major**, because the native modules work against
  exactly one ABI. Honest limit: every piece compiles and the filenames
  line up end to end, but **nothing has been installed on a fresh
  machine yet**.
- **🤖 The agent closes the loop.** After applying a change it re-reads
  the live page, resolves the finding when the change took, reverts
  when it did not, closes the task, and reports the traffic outcome 28
  days later — labelled `measured`, `thin` or `too early` so four
  clicks does not read like a result.
- **New: "I fixed this — check it"** — the same verification with no
  WordPress plugin, no key and no Google account. The only closing path
  available to a Wix, Squarespace or custom-stack site, which is most
  sites.
- **Work is ranked by the traffic a page actually gets**, not by
  severity, and says `severity only` when there is no traffic data
  rather than implying the order means something.
- **Findings the agent cannot fix become a developer ticket.** 30 of
  the crawler's 72 finding types are auto-fixable; 25 are out of reach
  with a stated reason; 17 are real gaps and the file names them.
- **🩺 System health says out loud when the install has stopped
  working** — eight checks, and "we have not looked" never renders the
  same as "nothing is wrong".
- **Fixed: nightly failures did not say why.** On the development
  install, 9 of 11 were one client whose domain had stopped resolving,
  and no stored error mentioned it. A dead domain has two spellings
  (`ENOTFOUND` and `net::ERR_NAME_NOT_RESOLVED`) and both classifiers
  knew only one, so a mistyped client URL produced "Something went
  wrong" and a link to file a bug report. 67 days of a one-minute fix
  being invisible.
- **🧰 Ten finished tools were absent from every menu.** They are in
  the navigation, behind one tool registry instead of several
  hand-maintained lists that had already drifted.
- **Connections name the tools they unlock**, and how much works with
  no key at all — "free" has to mean something you can check.
- **🔎 Rank checking works on a fresh install** with no key: SearXNG
  ships as an optional Docker profile. Four sources, headless browser
  last. A tracking redirect was also stealing a position and reporting
  a rank of 3 where there was none.
- **Fixed: a third of the keyword list had no data** and rendered as if
  the rank were merely unknown.
- **Fixed:** the nightly sweep's result was computed and thrown away;
  and a run that half failed painted a green tick.
- **Every critical and high advisory cleared**, with the pins where
  `npm` can see them as well as `pnpm` — the two had already drifted.
- **The paid-ads tooling is gone.** A free-first SEO tool; ads were
  neither. `google-ads-api` is optional and a normal install never
  fetches it.
- **No migrations.** Schema unchanged at 76. WordPress plugin
  unchanged. No new required dependencies.

## v0.10.1 — 2026-10-30

A one-line fix to the thing v0.10.0 introduced, found twenty minutes
after publishing it. [Full notes](docs/releases/v0.10.1.md)

- **Update downloaded the WordPress plugin instead of the app.** The new
  self-updater took the first attached file ending in `.zip`; a release
  has two, and the 30 KB plugin sorts first. Found by running the real
  download against the real release — it refused with "does not look
  like this app" rather than replacing an install with a plugin.
  `releaseAssetName()` is now the single owner of that filename, called
  by both the packaging script and the updater.

## v0.10.0 — 2026-10-30

Most AI features were quietly failing, several numbers were quietly
wrong, and the WordPress plugin could not be downloaded at all.
[Full notes](docs/releases/v0.10.0.md)

- **🤖 Four of five AI features were failing — and falling back
  silently.** Not crashing: *degrading*. The executive summary returned
  its deterministic template, the content summariser and review drafter
  returned "the AI provider did not respond", sentiment returned
  nothing. `callAI` returned `null` for no-key, retired-model,
  spend-cap and network errors alike, so all 68 call sites rendered the
  same empty box.
- **📉 Numbers that were wrong and said so with confidence.** The
  DuckDuckGo rank fallback always returned "not ranking"; Google
  positions counted anchors instead of results; the audit health score
  got *worse* the more pages you crawled.
- **🔌 The WordPress plugin is a download** — it could not be obtained
  at all before.
- **🔎 Rank checking no longer depends on a browser that keeps getting
  blocked.** Four sources in order: Search Console → SearXNG → Brave →
  headless browser. Measured the same day: Google served a JS
  interstitial, DuckDuckGo a CAPTCHA, Bing and Startpage empty shells.
- **🖱️ The launcher, and the Update button that never worked.**
- **💾 Backups moved out of the app folder**, which on a native install
  is the folder people delete, move or re-download.

## v0.9.0 — 2026-10-29

Claude Code works your tasks; Support & about; a licence correction.
[Full notes](docs/releases/v0.9.0.md)

- **⚖️ The About page told you the wrong licence.** It said this project
  was noncommercial and that you could not sell it, host it as a paid
  service, re-license it or rebrand it. It has been **MIT** since June
  2026 and all four are allowed. `LICENSE` always said MIT; only that
  page disagreed. A test now reads LICENSE and fails the build if any
  user-facing file names a different licence.
- **New: Claude Code on the host** (#49, @Galbir) — a chat per task
  working in the client's own project folder, a pull request per queue
  run with Merge and Merge all, per-client autopilot, and five new MCP
  tools (28 total). **Off until you switch it on**, in Settings →
  Claude Code on this computer or `SEO_TOOL_HOST_AGENT=1`;
  `SEO_TOOL_HOST_AGENT=0` is a hard off for any install other people
  can reach.
- **New: Support & about** — a live supporters tracker (total, people,
  goal progress, thanks with search) read from `supporters.json` in the
  repo, so it updates with no release; cached locally so it still shows
  offline, and labelled when it is cached. Free ways to help come first.
  A dashboard card after 5 audits, at most daily, with dismissals that
  mean what they say. Never shown in the client portal, a PDF or an
  invoice — a test fails the build if that slips.
- **Fixed:** the About page claimed two different tool counts, neither
  matching the README.
- **Fixed:** a missing total in the tracker file would have rendered
  "₹0 received" rather than nothing, because `Number(null)` is 0.
- Four database migrations (0071–0074) — **back up before updating**.
  WordPress plugin unchanged at 0.6.1. No new dependencies.

## v0.8.0 — 2026-10-28

Keyword Planner, content automation, and a broken Docker install.
[Full notes](docs/releases/v0.8.0.md)

- **If you download the release ZIP, read the notes.** v0.7.0 was
  changelogged but never published as a release, so ZIP users have not
  had its security fixes. They are in this one.
- **New: Google Keyword Planner** (#51, @Galbir) — real average monthly
  searches and competition, automatic keyword discovery that ranks by
  demand, feeding the schedules, the daily agent and a new
  `get_keyword_ideas` MCP tool. Free of charge, but it needs a Google
  Cloud project with Basic API access (brand verification required);
  the auto-approved Explorer tier excludes Keyword Planner.
- **Automations** (#48, @Galbir) — WooCommerce product posts read from
  the public Store API, GBP button choice and Offer posts, post length
  as a setting (default 300 chars), per-schedule keyword choice, product
  blog articles and roundups, Markdown export of blog drafts with
  frontmatter, and editing a schedule in place.
- **Fixed:** content schedules only ran inside the 24h daily sweep, so a
  slot could be skipped for a day; they now have their own 15-minute
  runner.
- **Fixed:** Romanian keyword ideas came back in Vietnamese — the
  language id was 1040, Romanian is 1032.
- **Fixed #47:** the Docker image carried browsers for a different
  Playwright release, so rank checks, SERP scraping and screenshots
  failed on every Docker install — and the error told Linux users to
  press a button on a Windows launcher.
- Corrected: the README claimed 22 MCP tools where there are 23, and
  claimed Keyword Planner needed only "a free Google Ads account".
- No database migrations. WordPress plugin unchanged at 0.6.1.
  `pnpm install` is required: #51 adds a dependency.

## v0.7.0 — 2026-10-22

Security and reliability. [Full notes](docs/releases/v0.7.0.md)

- **Security:** data exports (`*.csv`, disavow file, plan PDF) could be
  downloaded without signing in on password-protected installs — fixed.
- **Security:** team roles are enforced on every server action: viewers
  read-only, settings and admin actions owner-only, members limited to
  their clients. Backup, restore and update require the owner.
- **Security:** sign-in attempt limits; portal AI chat and public grader
  rate limits that can't be bypassed with a forged header; Secure cookie
  behind HTTPS proxies; health check no longer exposes the install path.
- **Fixed #43:** Google Business Profile posting (uses the client's
  listing, valid call-to-action, readable errors, Retry / Publish now).
- **Automation:** weekly jobs no longer depend on running on a Monday;
  rank checks run daily in rotation and report blocked checks honestly;
  capped jobs reach every client; failing reports and jobs back off.
- **New:** workspace time zone for scheduled reports; "last day of the
  month" schedules.
- **Fixed:** duplicate recurring tasks; repeated invoice numbers; invalid
  invoice lines silently dropped.
- **Backups:** download the encryption key alongside `data.db`.
- **Updates rebuild the app** automatically on the next start (they used
  to keep serving the old build).
- No database migrations. WordPress plugin unchanged at 0.6.1.

## v0.6.3 — 2026-10-19

Link intersect, and a run of confident wrong answers corrected.
[Full notes](docs/releases/v0.6.3.md)

## v0.6.2

A terminal command and a lookup the software should do itself.
[Full notes](docs/releases/v0.6.2.md)

## v0.6.1

Two reported issues, and three more found behind them.
[Full notes](docs/releases/v0.6.1.md)

## v0.6.0

[Full notes](docs/releases/v0.6.0.md)

## v0.2.0

[Full notes](docs/releases/v0.2.0.md)
