/**
 * Best-effort readable main content extraction from an arbitrary URL.
 *
 * Not a full Readability port — that would need jsdom, which is heavy
 * and blocks the free-first / small-VPS commitment. This is a
 * lightweight heuristic: fetch the HTML, strip head/nav/aside/footer/
 * script/style/comment nodes, then extract paragraph-ish blocks
 * (<p>, <h2>–<h6>, <li>) preserving their natural boundaries.
 *
 * Good enough to feed the AIO passage scorer, which only cares about
 * paragraph-level structure. If a page uses non-semantic layout
 * (everything in <div>s), the fallback keeps only text nodes with
 * more than 50 characters and drops the rest as chrome.
 */

import { REPO_UA_SUFFIX } from "./repo";

const USER_AGENT =
  `Mozilla/5.0 (compatible; SEO-Tool-Extractor/1.0; ${REPO_UA_SUFFIX})`;

export type ExtractedContent = {
  ok: boolean;
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  error?: string;
};

// Elements that are almost never part of the main article body
const CHROME_TAGS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "aside",
  "header",
  "footer",
  "form",
  "svg",
  "picture",
  "figure",
  "figcaption",
];

const CHROME_CLASS_RE =
  /\b(nav|menu|sidebar|footer|header|banner|ad-|advert|newsletter|subscribe|comment|share|social|breadcrumb|related|recommend|cookie|popup|modal|widget|toolbar|byline|meta|tag|category)\b/i;

export async function extractMainContent(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<ExtractedContent> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts?.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        ok: false,
        url,
        title: "",
        markdown: "",
        wordCount: 0,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|xhtml|xml/i.test(ct)) {
      return {
        ok: false,
        url,
        title: "",
        markdown: "",
        wordCount: 0,
        error: `Content-Type is ${ct || "unknown"} — need an HTML page.`,
      };
    }
    const html = await res.text();
    const parsed = parseHtmlToMarkdown(html);
    if (!parsed.markdown.trim()) {
      return {
        ok: false,
        url,
        title: parsed.title,
        markdown: "",
        wordCount: 0,
        error:
          "Fetched the page but couldn't extract any paragraph-level content. " +
          "The page might be JavaScript-rendered or gated behind a login.",
      };
    }
    return {
      ok: true,
      url,
      title: parsed.title,
      markdown: parsed.markdown,
      wordCount: parsed.markdown.split(/\s+/).filter(Boolean).length,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      title: "",
      markdown: "",
      wordCount: 0,
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parse HTML into a stream of paragraph-like blocks separated by blank
 * lines (i.e. markdown-ish). Preserves headings so the scorer can
 * treat them as section boundaries.
 */
export function parseHtmlToMarkdown(html: string): {
  title: string;
  markdown: string;
} {
  // 1. Pull the title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s+/g, " ").trim()
    : "";

  // 2. Strip HTML comments
  let body = html.replace(/<!--[\s\S]*?-->/g, "");

  // 3. Drop chrome tags entirely (including their contents)
  for (const tag of CHROME_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
    body = body.replace(re, " ");
  }

  // 4. Drop chrome-class containers by best-effort scan of div/section
  //    tags. We only strip when the class attribute matches CHROME_CLASS_RE.
  body = body.replace(
    /<(div|section|aside)\b([^>]*class=["'][^"']*["'])?[^>]*>[\s\S]*?<\/\1>/gi,
    (match, _tag, classAttr) => {
      if (classAttr && CHROME_CLASS_RE.test(classAttr)) return " ";
      return match;
    },
  );

  // 5. Extract each paragraph-like block. We rebuild markdown by
  //    iterating in DOM order — do a small stack-machine walk since
  //    we don't have a DOM.
  const blocks: string[] = [];
  const blockRe =
    /<(h1|h2|h3|h4|h5|h6|p|li|blockquote|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    const text = htmlBlockToText(inner);
    if (!text) continue;
    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      blocks.push(`${"#".repeat(level)} ${text}`);
    } else if (tag === "li") {
      blocks.push(`- ${text}`);
    } else if (tag === "blockquote") {
      blocks.push(`> ${text}`);
    } else {
      blocks.push(text);
    }
  }

  // 6. Fallback: if we got fewer than 3 blocks (page probably uses
  //    non-semantic markup), extract text nodes from the whole body.
  if (blocks.length < 3) {
    const stripped = body
      .replace(/<[^>]+>/g, "\n")
      .split(/\n+/)
      .map((s) => decodeEntities(s).replace(/\s+/g, " ").trim())
      .filter((s) => s.length >= 50);
    return {
      title,
      markdown: stripped.join("\n\n"),
    };
  }

  return { title, markdown: blocks.join("\n\n") };
}

function htmlBlockToText(html: string): string {
  const stripped = html
    // Preserve link URLs so cite-source scoring still works
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    // Strip everything else
    .replace(/<[^>]+>/g, "");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
