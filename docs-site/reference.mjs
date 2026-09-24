/**
 * The reference pages, generated from the application's own source.
 *
 * Every tool and every screen, read at build time out of
 * src/lib/tool-capabilities.generated.ts and
 * src/components/shell/nav-items.ts.
 *
 * Written this way on purpose. A hand-maintained list of 91 tools is a
 * list that is wrong within a month — someone adds a tool, nobody
 * remembers the docs, and the page quietly becomes a lie. Reading the
 * app's own data means the reference cannot drift: a tool that exists
 * appears, a tool that is removed disappears, and the descriptions are
 * the same words the person sees in the product.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Decode the few escapes that appear in generated single-line literals. */
const unq = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");

/**
 * Every route the app has, with the copy it shows for the ones that are
 * tools. One object per line in the generated file, so a line-wise read
 * is both sufficient and immune to the formatting changing around it.
 */
export function readRoutes() {
  const src = readFileSync(join(APP, "src/lib/tool-capabilities.generated.ts"), "utf8");
  const out = [];
  for (const line of src.split(/\r?\n/)) {
    const route = /route:\s*"([^"]+)"/.exec(line);
    if (!route) continue;
    const title = /title:\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    const description = /description:\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    out.push({
      route: route[1],
      title: title ? unq(title[1]) : null,
      description: description ? unq(description[1]) : null,
      needsAI: /needsAI:\s*true/.test(line),
      usesBrowser: /usesBrowser:\s*true/.test(line),
      aiRequired: /aiUsage:\s*"required"/.test(line),
    });
  }
  if (out.length < 100) throw new Error(`Only ${out.length} routes parsed — the generated file's shape changed.`);
  return out;
}

/** The sidebar, so the docs list screens in the order the app does. */
export function readNav() {
  const src = readFileSync(join(APP, "src/components/shell/nav-items.ts"), "utf8");
  const groups = [];
  let current = null;
  for (const line of src.split(/\r?\n/)) {
    const title = /^\s*title:\s*"([^"]+)"/.exec(line);
    if (title) {
      current = { title: title[1], items: [] };
      groups.push(current);
      continue;
    }
    const item = /href:\s*"([^"]+)"[^}]*?label:\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    if (item && current) current.items.push({ href: item[1], label: unq(item[2]) });
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (total < 40) throw new Error(`Only ${total} nav items parsed — nav-items.ts changed shape.`);
  return groups.filter((g) => g.items.length);
}

function badges(t) {
  const out = [];
  if (t.needsAI) {
    out.push(
      `<span class="pill pill-key" title="Needs an AI provider connected">${t.aiRequired ? "AI required" : "AI optional"}</span>`,
    );
  } else {
    out.push('<span class="pill pill-free">No key needed</span>');
  }
  if (t.usesBrowser) out.push('<span class="pill">Runs a browser</span>');
  return out.join(" ");
}

/** Strip the decorative star the product uses to mark its favourites. */
const clean = (s) => s.replace(/\s*⭐\s*$/, "").trim();

export function toolsPage() {
  const tools = readRoutes()
    .filter((r) => r.route.startsWith("/tools/") && r.title && r.description)
    .sort((a, b) => clean(a.title).localeCompare(clean(b.title)));

  const rows = tools
    .map(
      (t) => `<tr id="tool-${esc(t.route.replace("/tools/", ""))}">
  <td><strong>${esc(clean(t.title))}</strong><br><span style="color:var(--fg-dim);font-size:12.5px">${esc(t.route)}</span></td>
  <td>${esc(t.description)}<div style="margin-top:6px">${badges(t)}</div></td>
</tr>`,
    )
    .join("\n");

  const needAi = tools.filter((t) => t.needsAI).length;
  const browser = tools.filter((t) => t.usesBrowser).length;

  return {
    slug: "tools.html",
    group: "Reference",
    title: "Every tool",
    description: `All ${tools.length} tools in the SEO Tool, what each one does, and which need an AI key.`,
    lede:
      `All <strong>${tools.length}</strong> tools, with the same description the app shows. ` +
      `<strong>${tools.length - needAi}</strong> work with no key at all; ` +
      `<strong>${needAi}</strong> use an AI provider and <strong>${browser}</strong> drive a real browser.`,
    sections: [
      {
        id: "using",
        h2: "How to use this list",
        html: `
<p>Open <strong>All tools</strong> in the app to reach any of these, or pin the ones you use
to the top of that screen. Many run on their own overnight — see
<a href="automation.html#nightly">Automation</a> — and the rest are there when you want them.</p>
<div class="note"><strong>This list is generated from the software itself</strong>
<p>Titles, descriptions and the key requirements come straight out of the app at build time,
so this page cannot drift out of date the way a hand-written list would.</p></div>`,
      },
      {
        id: "all",
        h2: "All tools, A to Z",
        html: `<table><thead><tr><th style="width:34%">Tool</th><th>What it does</th></tr></thead>
<tbody>\n${rows}\n</tbody></table>`,
      },
    ],
    // Every tool name becomes a search term.
    searchExtra: tools.map((t) => ({
      title: clean(t.title),
      url: `tools.html#tool-${t.route.replace("/tools/", "")}`,
      text: `${t.description} ${t.route}`,
    })),
  };
}

export function screensPage() {
  const groups = readNav();
  const routes = new Map(readRoutes().map((r) => [r.route, r]));

  const blocks = groups
    .map((g) => {
      const rows = g.items
        .map((item) => {
          const meta = routes.get(item.href);
          const note = meta && meta.description ? esc(meta.description) : "";
          return `<tr id="screen-${esc(item.href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home")}">
  <td><strong>${esc(clean(item.label))}</strong><br><span style="color:var(--fg-dim);font-size:12.5px">${esc(item.href)}</span></td>
  <td>${note}${meta ? `<div style="margin-top:6px">${badges(meta)}</div>` : ""}</td>
</tr>`;
        })
        .join("\n");
      return `<h3>${esc(g.title)}</h3><table><tbody>\n${rows}\n</tbody></table>`;
    })
    .join("\n");

  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return {
    slug: "screens.html",
    group: "Reference",
    title: "Every screen",
    description: `All ${count} screens in the SEO Tool, in the order the sidebar lists them.`,
    lede:
      `Every destination in the sidebar, in the order the app lists them — useful when you know ` +
      `what you want to do but not where it lives.`,
    sections: [
      {
        id: "all",
        h2: "The sidebar, in order",
        html:
          `<p>Guided mode shows about fifteen of these; Pro mode shows all of them. The toggle is
at the bottom of the sidebar.</p>\n` + blocks,
      },
    ],
    searchExtra: groups.flatMap((g) =>
      g.items.map((item) => ({
        title: clean(item.label),
        url: `screens.html#screen-${item.href.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}`,
        text: `${g.title} ${item.href}`,
      })),
    ),
  };
}
