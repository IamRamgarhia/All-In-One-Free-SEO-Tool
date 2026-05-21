# No paid API required — policy + verified scope

The user-facing promise: **every tool in this app works without
spending a single dollar on third-party APIs.**

A user only needs:
- Either a **free LLM key** (Gemini, Groq, OpenRouter, DeepSeek,
  Cerebras, Mistral, Together, GitHub Models — all have generous
  free tiers, no credit card)
- **OR** a paid key they already have (OpenAI, Anthropic) — never
  required, just optional upgrade for higher quality
- **OR** zero keys — local Ollama runs fully offline

That's it. No DataForSEO, no SerpAPI, no Ahrefs API, no Moz, no
ValueSERP — none of those are required by any tool.

---

## Verified-clean tools (no paid API needed)

| Tool | Free-tier source |
|------|------------------|
| Site audit (crawler) | Own crawler — no API |
| Tech-stack detection | Wappalyzer OSS — bundled |
| Core Web Vitals | PageSpeed Insights API — 25k requests/day free |
| Keyword research | Google autocomplete + People Also Ask scraping |
| Rank tracker | Headless Playwright — own infrastructure |
| SERP scans | Headless Playwright |
| Cannibalization detector | GSC API — free |
| Content decay | GSC + GA4 — both free |
| Content gap | GSC + competitor SERP scrapes |
| AI visibility (ChatGPT / Perplexity / etc.) | User's chosen LLM provider (free works) |
| Brand monitor | LLM provider + SERP scrapes |
| GBP manager | Google Business Profile API — free |
| Local rank | Headless browser with geo override |
| Backlinks | GSC backlinks + Common Crawl + Ahrefs WMT CSV import (free) |
| Schema validator | Local validation, no external call |
| Robots.txt validator | Local validation |
| Reports + exec summary | LLM provider (free works) |
| Page change monitor | Own crawler |
| Image generation | **Pollinations.ai (free, no key)** with optional OpenAI upgrade |
| OCR (English) | Tesseract.js — bundled, offline |
| Vision / multimodal | Gemini free tier supports vision |

---

## Optional paid integrations (BYO key only — never required)

| Service | What it adds | Why optional |
|---------|--------------|--------------|
| OpenAI | Higher-quality writing + DALL-E 3 image gen | Gemini / Pollinations cover the same use cases for free |
| Anthropic | Claude for writing | Gemini covers this for free |
| DataForSEO | Higher-precision rank tracking | Browser-mode rank check works free with ~±1-2 noise |
| SerpAPI / Serper | Higher-throughput SERP scraping | Browser-mode covers it free |

If a user adds one of these, the tool routes through it for that
feature. If they don't, the tool uses the free path. Both paths must
produce a working result — no feature should silently degrade to
"sign up for X first."

---

## Maintainer-side costs (NOT user-side)

These are costs the project maintainer (DiceCodes) may pay, never
billed to users:

- **Apple Developer ID** (~$99/yr) — needed for signed macOS builds
  so Gatekeeper doesn't show the scary "unidentified developer"
  warning. Self-hosters who don't want signed builds can build their
  own unsigned binary from source.
- **Windows code-signing cert** (~$70-200/yr) — needed for Windows
  SmartScreen reputation. Same — self-hosters can build unsigned.
- **GitHub Actions minutes** — free tier covers OSS projects.
- **Docker Hub or GitHub Container Registry** — free for OSS.

**Users pay none of this.** The user downloads a pre-built binary or
runs `docker compose up` and they're done.

---

## Enforcement rules for contributors

When adding a new tool:

1. **Default path must be free.** If the only way the tool works is
   with a paid API, the PR is rejected.
2. **BYO paid keys are fine** for higher-tier features, but the
   feature must offer a free fallback.
3. **Error messages should never say "buy X to use this."** If a free
   path exists, say "this works better with a $X key but the free
   path runs by default."
4. **Document the free-tier limit.** If Pollinations.ai rate-limits
   you, say so. If PageSpeed has 25k/day, say so. Honesty about the
   limits avoids the "tool stopped working overnight" support tickets.

When changing an existing tool:

5. **Don't introduce a paid-API requirement without a free path.** If
   the new approach genuinely needs a paid API, ship the paid path as
   an opt-in upgrade and keep the old free path running.

---

## What was just fixed to satisfy this policy

- `src/lib/image-gen.ts` was OpenAI-only. Now defaults to
  Pollinations.ai (zero-key, free, no rate limit on reasonable use)
  and uses OpenAI DALL-E 3 only when the user explicitly has an
  OpenAI key configured. The free path is genuinely the default;
  paid is a quality upgrade.

Audit-clean as of 2026-05-21. Re-run the grep below before any
release to confirm nothing has slipped in:

```bash
rg -i 'dataforseo|serpapi|valueserp|scaleserp|brightdata|oxylabs|moz_api|ahrefs_api|semrush_api' src/
```

If any non-comment match appears, that file needs a free fallback
before shipping.
