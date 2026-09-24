/**
 * Build the documentation site into docs-site/dist/.
 *
 * Output is plain static files — HTML, one CSS, one JS, a JSON search
 * index, a sitemap. Upload the folder anywhere; there is no server, no
 * build step on the host and no framework. That matters because these
 * are the pages someone reads when the software itself will not start.
 *
 * Content lives in content.mjs. This file is only the shell: head tags,
 * nav, table of contents, search index, sitemap.
 *
 *   node docs-site/build.mjs [--base /seo-tool/]
 */

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, SITE } from "./content.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "dist");

const baseArg = process.argv.indexOf("--base");
/** Where the folder will live on the domain, e.g. "/seo-tool/". */
const BASE = baseArg !== -1 && process.argv[baseArg + 1] ? process.argv[baseArg + 1] : SITE.base;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Strip tags for the search index and meta descriptions. */
const text = (html) =>
  String(html).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();

function sidebar(currentSlug) {
  const groups = [];
  for (const page of PAGES) {
    let group = groups.find((g) => g.title === page.group);
    if (!group) groups.push((group = { title: page.group, items: [] }));
    group.items.push(page);
  }
  return groups
    .map(
      (g) =>
        `<h4>${esc(g.title)}</h4>` +
        g.items
          .map(
            (p) =>
              `<a href="${BASE}${p.slug}"${p.slug === currentSlug ? ' class="active" aria-current="page"' : ""}>${esc(p.navTitle || p.title)}</a>`,
          )
          .join(""),
    )
    .join("");
}

function toc(page) {
  const items = page.sections.filter((s) => s.id && s.h2);
  if (items.length < 2) return "";
  return (
    `<div class="toc-title">On this page</div>` +
    items.map((s) => `<a href="#${s.id}">${esc(s.h2)}</a>`).join("")
  );
}

function pager(i) {
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  if (!prev && !next) return "";
  return (
    `<nav class="pager">` +
    (prev
      ? `<a href="${BASE}${prev.slug}"><span>Previous</span>${esc(prev.title)}</a>`
      : `<span></span>`) +
    (next
      ? `<a class="next" href="${BASE}${next.slug}"><span>Next</span>${esc(next.title)}</a>`
      : `<span></span>`) +
    `</nav>`
  );
}

function shell(page, i) {
  const body = page.sections
    .map((s) => (s.h2 ? `<h2 id="${s.id}">${esc(s.h2)}</h2>\n${s.html}` : s.html))
    .join("\n");

  const canonical = `${SITE.origin}${BASE}${page.slug}`;
  const description = page.description || text(page.sections[0]?.html || "").slice(0, 155);

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · ${esc(SITE.name)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(page.title)} · ${esc(SITE.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE}assets/docs.css">
<script>
/* Set the theme before first paint so a dark-mode reader never gets a
   white flash. Inline on purpose — an external file is too late. */
try{var t=localStorage.getItem('seo-docs-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}
</script>
</head>
<body data-base="${BASE}">
<header class="topbar">
  <button class="btn" id="menu-toggle" aria-label="Menu" aria-expanded="false">Menu</button>
  <a class="brand" href="${BASE}"><span class="dot"></span>SEO Tool <small>docs</small></a>
  <div class="search-wrap">
    <input id="search" type="search" placeholder="Search the docs&hellip;  /" autocomplete="off" aria-label="Search documentation">
    <div id="results" role="listbox"></div>
  </div>
  <div class="topbar-right">
    <button class="btn" id="theme-toggle" type="button">Light</button>
    <a class="btn" href="${SITE.repo}" rel="noopener">GitHub</a>
    <a class="btn btn-primary" href="${SITE.download}" rel="noopener">Download</a>
  </div>
</header>

<div class="shell">
  <nav class="sidebar" aria-label="Documentation">${sidebar(page.slug)}</nav>
  <main>
    ${page.eyebrow ? `<div class="eyebrow">${esc(page.eyebrow)}</div>` : ""}
    <h1>${esc(page.title)}</h1>
    ${page.lede ? `<p class="lede">${page.lede}</p>` : ""}
    ${body}
    ${pager(i)}
  </main>
  <aside class="toc" aria-label="On this page">${toc(page)}</aside>
</div>

<footer><div class="inner">
  <span>${esc(SITE.name)} — free and open source, MIT licensed.</span>
  <a href="${SITE.repo}" rel="noopener">Source</a>
  <a href="${SITE.repo}/issues" rel="noopener">Report a problem</a>
  <a href="https://dicecodes.com" rel="noopener">DiceCodes</a>
</div></footer>

<script src="${BASE}assets/docs.js" defer></script>
</body>
</html>
`;
}

/**
 * Empty dist without deleting dist itself.
 *
 * Removing the directory fails with EPERM whenever anything holds it
 * open — a preview server, or a file manager sitting in it — and the
 * error names rmSync rather than the thing actually holding it, which
 * cost twenty minutes the first time. Clearing the contents works in
 * that case, and if even that fails the reason is said in words.
 */
function emptyDist() {
  mkdirSync(OUT, { recursive: true });
  for (const entry of readdirSync(OUT)) {
    try {
      rmSync(join(OUT, entry), { recursive: true, force: true });
    } catch (err) {
      throw new Error(
        `Could not clear ${join(OUT, entry)} (${err.code}).\n` +
          `  Something has it open — usually a preview server. Stop it and run this again.`,
      );
    }
  }
}

function build() {
  emptyDist();
  mkdirSync(join(OUT, "assets"), { recursive: true });

  for (const file of readdirSync(join(HERE, "assets"))) {
    cpSync(join(HERE, "assets", file), join(OUT, "assets", file));
  }

  const index = [];
  PAGES.forEach((page, i) => {
    writeFileSync(join(OUT, page.slug), shell(page, i), "utf8");

    // One entry per section, so search lands on the heading someone
    // wanted rather than the top of a long page.
    index.push({
      title: page.title,
      page: page.group,
      url: page.slug,
      text: text(page.lede || "") + " " + text(page.sections.map((s) => s.html).join(" ")).slice(0, 1200),
    });
    for (const s of page.sections) {
      if (!s.id || !s.h2) continue;
      index.push({
        title: s.h2,
        page: page.title,
        url: `${page.slug}#${s.id}`,
        text: text(s.html).slice(0, 700),
      });
    }
  });

  writeFileSync(join(OUT, "search-index.json"), JSON.stringify(index), "utf8");

  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      PAGES.map(
        (p) =>
          `  <url><loc>${SITE.origin}${BASE}${p.slug}</loc><lastmod>${today}</lastmod></url>`,
      ).join("\n") +
      `\n</urlset>\n`,
    "utf8",
  );

  writeFileSync(
    join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${SITE.origin}${BASE}sitemap.xml\n`,
    "utf8",
  );

  const pages = PAGES.length;
  process.stdout.write(
    `  Built ${pages} pages + search index (${index.length} entries) into docs-site/dist\n` +
      `  Base path: ${BASE}\n` +
      `  Upload the contents of dist/ to ${SITE.origin}${BASE}\n`,
  );
}

build();
