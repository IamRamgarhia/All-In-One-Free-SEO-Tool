# GitHub repo page — what to edit and why

What I CAN edit via code (already applied this session):
- LICENSE file → MIT
- README.md → new title, MIT license section, expanded keyword line
- package.json → name change + 60+ keywords
- ROADMAP.md, CLAUDE.md → MIT references updated

What I CANNOT edit from code (you have to do these manually in
github.com → Settings, or grant me a GitHub token):
- Repo description (top of the GitHub page)
- Repo topics (the chip row under the description)
- Repo homepage URL
- Repo display name
- Open Graph / social preview image
- Repository renaming
- Pinned issues
- README rendering settings

Below is exactly what to change.

---

## 1. Repository name

**Current:** `SEO-Tool`

**Recommendation:** keep `SEO-Tool` (changing it breaks every existing
clone URL + every Google ranking we have). Use the README title +
description + topics to capture the new "All-In-One Free SEO Tool"
positioning instead.

GitHub auto-redirects old URLs after a rename, but every existing
star, fork, npm install instruction, and SEO ranking will still
break temporarily. Not worth it for marginal naming SEO.

---

## 2. Description (Settings → top of page)

**Replace with:** (max 350 chars — currently looks fine)

```
All-in-one free SEO tool & open-source alternative to Ahrefs, Semrush, Moz, SE Ranking. 150+ tools: site audits, rank tracking, AI search visibility (ChatGPT/Perplexity/Gemini), keyword research, content briefs, local SEO, white-label reports. Self-hosted. MIT. No paid APIs.
```

---

## 3. Topics (Settings → About → Topics)

**Current (20):**
ahrefs-alternative, ai-seo, ai-seo-tool, free-seo-tool, free-seo-tools,
geo-seo, keyword-research, local-seo, open-source, playwright,
rank-tracker, self-hosted, semrush-alternative, seo, seo-audit,
seo-optimization, seo-software, seo-tool, site-audit, wordpress-seo

GitHub allows up to **20** topics. The current set is decent but
missing some high-value discoverability terms.

**Replace with (20 — better-tuned for what people actually search
for on GitHub):**

```
seo
seo-tool
all-in-one-seo
free-seo-tool
open-source-seo
self-hosted
ahrefs-alternative
semrush-alternative
moz-alternative
rank-tracker
keyword-research
site-audit
technical-seo
local-seo
ai-seo
geo-seo
ai-search
llm-citations
backlink-checker
white-label-seo
```

Changes:
- Added: `all-in-one-seo`, `moz-alternative`, `technical-seo`,
  `ai-search`, `llm-citations`, `backlink-checker`,
  `white-label-seo`
- Removed: `ai-seo-tool` (dup of `ai-seo`), `free-seo-tools` (dup of
  `free-seo-tool`), `geo-seo` (less searched than `ai-search`),
  `open-source` (redundant — assumed),
  `playwright` (implementation detail, not user search),
  `seo-optimization` (vague), `seo-software` (less common than
  `seo-tool`), `wordpress-seo` (we support more than WP)

---

## 4. Homepage URL (Settings → About → Website)

**Current:** `https://dicecodes.com/`

**Recommendation options:**
- A: keep `https://dicecodes.com/` (your portfolio — shows credibility)
- B: change to a dedicated landing page if you build one
- C: change to GitHub Pages docs site if you set one up

A is fine. Keep.

---

## 5. Social preview image (Settings → Social preview)

Currently uses the default (the README first image). For maximum
click-through on Twitter / LinkedIn / Reddit shares, upload a
custom 1280×640 PNG with:
- "All-In-One Free SEO Tool" headline
- One-liner: "Ahrefs / Semrush alternative · MIT · self-hosted"
- A screenshot collage of 3-4 tools (dashboard + audit + AI visibility)
- DiceCodes attribution at bottom

Tool: Figma / Canva / Penpot — generate at 1280×640 → PNG → upload.
~30 min once. Massive impact on share CTR.

---

## 6. Pinned issues

Currently none. Worth pinning:
- A "Welcome / Discussion" issue with the install one-liner +
  Discord/Slack link if you set one up.
- A "Roadmap" issue linking to ROADMAP.md so visitors see what's
  coming next.
- A "Show us your install" thread for users to share their setups.

---

## 7. GitHub Discussions

Already enabled. Worth seeding 3-5 starter posts so it doesn't look
empty:
- "📣 Announcements" — pin a "Welcome" post
- "💡 Ideas" — paste from ROADMAP.md "Coming next"
- "🙋 Q&A" — seed with the top 3 questions from your inbox
- "🎉 Show and tell" — for users to share their setups

---

## 8. README content edits already done this session

- Headline: "All-In-One Free SEO Tool — Open-Source Alternative to
  Ahrefs, Semrush, Moz & SE Ranking"
- Subhead expanded with concrete AI-search keywords (ChatGPT,
  Perplexity, Gemini, AI Overviews)
- License badge: MIT (was PolyForm)
- New badge: "Free Forever"
- Keyword sentence under badges — packs every search term someone
  might Google their way to us with
- Updated license section explaining MIT permissions

---

## 9. Things to consider for SEO of the repo page itself

GitHub repo pages get crawled and ranked by Google. To rank for
"free SEO tool github", "ahrefs alternative open source",
"semrush alternative github", etc:

- Repo description is the biggest single ranking lever (already
  updated above)
- README headline (H1) matters — already updated
- Topics matter — already updated
- Stars matter (we're at 5 — this grows organically with marketing)
- README freshness matters — GitHub indexes commits, so each push
  signals an active project

The MIT license change alone makes the repo eligible for inclusion
on more "best open source SEO tools" lists (some auto-curators
filter to OSI-approved licenses).
