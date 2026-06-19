# Next UX improvements — chat-doable list

Date: 2026-06-19
Status: candidate backlog for follow-on sessions

What this session already shipped (so you can see what's NEW vs done):
- Desktop HTML launcher (`SEO Tool.html` — smart launchpad)
- License → MIT
- Project rename: "All-In-One Free SEO Tool"
- Expanded SEO keyword set in package.json + README
- 4 bug fixes (credit-saver/learned-rules dropped on 9 providers,
  workspace-wide AI flood, sentiment-loop miscategorisation, manual
  backup WAL-checkpoint)

---

## High-value, chat-doable UX wins

### 1. First-launch wizard inside the HTML launcher itself
The desktop launcher is currently passive — "click here when you want
it". Could become an active first-run helper: detect a fresh install
(no `.seo-port` AND server has never started) and walk the user
through (a) double-click START.cmd, (b) approve any Windows / macOS
"unidentified app" warning. ~1 hour.

### 2. "Open in app window" toggle on /settings
We already use `--app=URL` mode in START.cmd / START.sh, but only on
first open. A setting that ALWAYS forces app-window mode (and a
visible note "tip: pin this window to your taskbar for instant
access") makes the daily-use experience feel native. ~half hour.

### 3. One-click "Reset everything" button on /settings/health
When something goes weird (corrupted .next, stuck process, port
collision), the recovery path today is "delete .next, kill the PID
file, restart". A single button that runs `STOP → wipe .next → wipe
.dev-server.* → START` saves the most-common support email. ~1 hour.

### 4. Visible "what's running right now" indicator
The top bar already shows live status. Add a tooltip-on-hover that
lists which tick runners are currently in-flight (`tickDailyAgent`,
`tickAutoBackup`, `tickRetentionCleanup`, `tickWeeklyDigestRunner`).
Replaces "is the system stuck?" anxiety with concrete visibility.
~1 hour.

### 5. Bigger CTAs on the empty dashboard
Even with the welcome redirect from Move #1, returning users who
dismissed the gate land on a near-empty dashboard. Adding a single
"Run your first audit" hero card with a domain input that bypasses
the full onboarding for users-in-a-hurry would help. ~1 hour.

### 6. Light mode polish
Several pages assume dark mode visually. The `prefers-color-scheme:
light` paths exist but some custom colors (rose/violet/amber rings)
look harsh on white. A 30-min sweep with the contrast tool finds and
softens them. ~half-day for a polish pass.

### 7. Keyboard shortcuts visible everywhere
We have `/shortcuts` and `shortcuts-help-hotkey.tsx` but a
discoverable "press ?" hint somewhere on every page is missing. Add a
subtle bottom-right keyboard-icon badge that opens the cheat sheet.
~half hour.

### 8. Better "Generating…" affordances on long AI operations
Many AI buttons show only a tiny spinner. Adding inline progress
("Calling OpenAI… expected 8 seconds") with an elapsed-time counter
makes 30-second AI calls feel half as long. ~2 hours across all major
AI buttons.

### 9. Sticky "Save" buttons on long settings forms
The browser-pool config, brand identity form, etc. are long enough
to scroll. The Save button at the bottom requires a scroll-up after
a tweak. A sticky footer-bar with Save + Cancel that appears once
the form is dirty matches modern app patterns. ~1 hour.

### 10. Empty-state celebrations
When the user's first audit finishes / first task completes / first
report sends, a subtle one-time toast ("🎉 First audit complete —
here's what we found") creates the dopamine hit. Tracked via
`onboarding.first_X_at` settings (already have the pattern from
`onboarding.dismissed_at`). ~2 hours total for 4-5 milestones.

---

## Medium-effort wins

### 11. PWA installation prompt
We have a `manifest.webmanifest`. Make the install prompt appear on
the dashboard once the user has been around for >7 days — "Install
as a desktop app for faster access". Already supported by Chrome /
Edge / Safari. ~1 hour.

### 12. Bulk-add tasks from any audit
The audit detail page generates tasks one-by-one. A "Generate tasks
for all critical+high issues" button would save 20+ clicks per
audit. ~2 hours.

### 13. Cross-client clipboard
Cut/paste a task between clients today requires recreating it.
Adding a "Send to client X" dropdown on the task detail page is a
small but high-leverage agency feature. ~half-day.

### 14. Inline "Run again" on history pages
`/snapshots`, `/history`, `/serp-scans` show past runs but require
navigating away to re-run. An inline re-run button on each row
collapses the round-trip. ~2 hours.

### 15. Compact data-density toggle
Pro users want tighter rows. A "Compact" toggle in /settings that
reduces row height by ~30% across major tables (Tailwind class
swap). ~half-day.

---

## Bigger items (deferred — separate engagements)

- Streaming AI responses (refactor every callAI site)
- i18n / multi-language UI (touches every string)
- Multi-user with row-level locking
- Native mobile apps (Tauri mobile or Capacitor — Tauri sidecar
  already dropped per user request, but mobile is a different scope)
- Looker Studio / Metabase dashboard templates

---

## Recommended next session

Pick **#3 (reset everything)** + **#4 (what's running)** +
**#9 (sticky save)** + **#10 (celebrations)** as a focused "polish
+ reliability" half-day. None require new dependencies, all are
visible to every user, and together they meaningfully lift the
"feels professional" score on first impression.
