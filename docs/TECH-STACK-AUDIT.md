# Tech stack audit — is every dep the best available?

Date: 2026-05-21
Question: "are we using the best-available tech on the internet?"

Criteria for each dep:
- **Maintenance** — actively shipped vs frozen / deprecated?
- **Quality** — best-in-class for what it does?
- **Footprint** — bundle size / RAM / disk?
- **Lock-in** — easy to swap later?

Verdict per row:
- ✅ **Keep** — best available, no reason to change.
- 🟡 **Watch** — fine for now, monitor; defer decision.
- 🔁 **Swap eventually** — better option exists, migration cost is non-trivial.
- ❗ **Swap now** — known issue worth fixing this quarter.

---

## Core framework

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **next** | 16.2.4 | ✅ Keep | Latest stable Next. App Router is mature. Right choice for full-stack TS + SSR + server actions. |
| **react / react-dom** | 19.2.4 | ✅ Keep | React 19 is the current stable. Server Components, useFormState, async server actions all available. |
| **typescript** | 5.x | ✅ Keep | Industry standard. Strict mode enabled. |
| **tailwindcss** | 4 | ✅ Keep | v4 is current. Oxide engine. Build is fast. |
| **eslint** | 9 | ✅ Keep | Flat-config v9. `eslint-config-next` matches Next 16. |

## Database + ORM

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **better-sqlite3** | 12.10.0 | ✅ Keep | The right choice for a single-user local-first app. 4-10× faster than the async `sqlite` binding. Synchronous API simplifies code. Native build is a deploy hurdle, but the installer's 4-strategy cascade handles it cleanly. Alternative `libsql/turso-client` is for edge — irrelevant here. |
| **drizzle-orm** | 0.45.2 | ✅ Keep | Lightweight, SQL-first, no binary engines (unlike Prisma — which would balloon the self-host download). CLAUDE.md decision log already locked this in. |
| **drizzle-kit** | 0.31.10 | ✅ Keep | Drizzle's official migration tool. |

## Browser automation + scraping

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **playwright** | 1.59.1 | ✅ Keep | Best-in-class headless browser. Better stealth + cross-browser support than Puppeteer. Already supports the remote-browser-endpoint path (Browserless / Cloudflare Browser Rendering / Browserbase) via `chromium.connect()` — that's the right way to scale beyond a single VPS. |

## PDF + image generation

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **pdfkit** | 0.18.0 | 🟡 Watch | Mature, old API. For pixel-perfect typography + complex layout, `@react-pdf/renderer` (JSX → PDF) is the modern winner. Our current pdfkit implementation works and produces good reports — the swap is ~2-3 days of layout-rewriting work for marginal output improvement. Defer to v2 unless we add complex page layouts. |
| **satori** | 0.26.0 | ✅ Keep | Vercel's HTML/JSX → SVG. Best-in-class. Used for OG images. |
| **@resvg/resvg-js** | 2.6.2 | ✅ Keep | Pairs with satori for SVG → PNG. Rust-backed, fast. |
| **sharp** (transitive) | — | ✅ Keep | Best image processor in Node. Used by Next.js for image optimization. |
| **qrcode** | 1.5.4 | ✅ Keep | Standard. Fine. |

## UI primitives + design system

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **@base-ui/react** | 1.4.1 | ✅ Keep | The Radix team's successor library. Modern correct choice. |
| **shadcn** | 4.6.0 | ✅ Keep | Components-as-code (copied into the repo, not imported). Zero runtime lock-in. |
| **lucide-react** | 1.14.0 | ✅ Keep | Best free icon set (Feather successor). 1000+ icons, tree-shakes. |
| **motion** | 12.38.0 | ✅ Keep | Formerly framer-motion. Best React animation lib. |
| **sonner** | 2.0.7 | ✅ Keep | Best toast library. |
| **class-variance-authority + clsx + tailwind-merge** | various | ✅ Keep | Standard shadcn trio. |
| **tw-animate-css** | 1.4.0 | ✅ Keep | Plugin for Tailwind v4 animations. |

## Charts

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **recharts** | 3.8.1 | ✅ Keep | Recharts 3 is current. Solid for the dashboards. Bundle is sizeable but tree-shakes adequately. |
| **@tremor/react** | 3.18.7 | 🔁 Swap eventually | Tremor pivoted to a paid product ("Tremor Studio") and the OSS library is essentially frozen. Used in only 2 files (`usage-charts.tsx`, `rank-sparkline.tsx`) for 4 components (BarChart, DonutChart, Legend, SparkAreaChart). Recharts (already a dep) can replace all four. ~2 hours of migration. Worth doing before any major chart refresh. |

## Validation + utilities

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **zod** | 4.4.1 | ✅ Keep | Industry standard. Alternative `valibot` saves ~20kb but the ergonomics and ecosystem of zod (Drizzle integration, tRPC, etc.) make the trade unfavourable for us. |

## Email + integrations

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **nodemailer** | 8.0.7 | ✅ Keep | Best SMTP client for Node. |
| **xlsx** | 0.18.5 | 🟡 Watch | The community/free version has a known prototype-pollution CVE. **HOWEVER**: we use it in exactly one place — `src/db/import-xlsx.ts`, a one-shot dev script that reads the maintainer's own local Excel file. The vector doesn't apply (we never process untrusted xlsx). Keep; document the constraint in the file header. |
| **tesseract.js** | 7.0.0 | ✅ Keep (with caveat) | Best free in-process OCR for Node. **Gap**: CLAUDE.md spec calls for PaddleOCR via Python sidecar for multilingual / non-Latin scripts. We don't ship that yet. Add in v2 if multilingual demand emerges. |

## Tooling

| Dep | Version | Verdict | Reason |
|-----|---------|---------|--------|
| **tsx** | 4.21.0 | ✅ Keep | Best TS-script runner. Replaces ts-node. |

---

## What's MISSING that probably should be there

These aren't bugs in the current stack — they're gaps where adding a dep would lift the system.

| Gap | What to add | When | Cost |
|-----|-------------|------|------|
| Error tracking | Sentry (or self-hosted Glitchtip) | When user count > self | Low — opt-in only |
| Job queue | BullMQ + Redis | When agency multi-user lands | Medium — adds Redis dep |
| Rate limiting | Simple in-memory bucket lib (e.g. `bottleneck` or hand-rolled) | If APP_PASSWORD exposed to LAN | Low — 50 LOC |
| HTTP retry/backoff | `p-retry` or hand-rolled | Already partial (ai-call has timeout) | Low — wrapper around fetch |
| Multilingual OCR | PaddleOCR Python sidecar | When international users complain | High — Python runtime added |
| Telemetry | None — privacy-first by design | Never default-on | — |

---

## Sidecar / packaging stack (for Move #5)

The Move #5 plan calls for a single-file binary so users don't need Node installed at all. Options compared:

| Approach | Binary size | Effort | Maintenance | Verdict |
|----------|-------------|--------|-------------|---------|
| **Tauri sidecar (Rust shell + bundled Node)** | ~30 MB shell + Node | Medium | Active, well-funded | ✅ **Best choice** — smallest binary, best DX, ships with native menus + tray support |
| Electron | 100+ MB | Low | Active but heavy | ❌ Overkill for a web app shell |
| pkg / nexe | ~80 MB single file | Low | **Deprecated** by their maintainers | ❌ Don't pick a deprecated tool |
| NW.js | 60-80 MB | Medium | Slower release cadence | ❌ Tauri wins on every axis |
| Plain Docker image | 0 (uses Docker) | None | Already shipped | ✅ Keep as the power-user path |

**Recommendation:** Tauri sidecar for the single-file install. The shell is ~30 MB, the Node binary adds ~80 MB, total ~110 MB — half of Electron, an order of magnitude smaller than NW.js. The Rust shell gives us tray icon, native menus, deep-linking, and auto-updater "for free." Build matrix via GitHub Actions for Mac (arm64 + x86_64), Windows (x86_64), Linux (x86_64 + arm64).

**Companion tools for the sidecar build:**
- **Tray icon:** `systray` (Rust crate built into Tauri) — no extra dep
- **Auto-update:** `tauri-plugin-updater` — checks GitHub releases JSON
- **Code signing:** Apple Developer ID ($99/yr) for macOS; Windows code-signing cert via Certum/Sectigo (~$70-200/yr) for SmartScreen reputation
- **CI/CD:** GitHub Actions — `tauri-apps/tauri-action` handles the multi-OS build

This is the right tech. Execution is multi-day; not in scope this session.

---

## Concrete swaps worth doing now

1. **`@tremor/react` → `recharts` directly** — 2 hours, removes a maintenance-mode dep. The 4 components used (BarChart, DonutChart, Legend, SparkAreaChart) all have recharts equivalents.
2. **`xlsx` security comment** — add a header comment to `src/db/import-xlsx.ts` documenting that the CVE doesn't apply because input is trusted local file only. Defensive against future contributor confusion.

Everything else is fine as-is.

---

## Headline

**The current stack is genuinely good.** No emergencies. Two deferred swaps (Tremor, eventual pdfkit upgrade), one small documentation tweak (xlsx), and Move #5's Tauri sidecar is the highest-impact addition.
