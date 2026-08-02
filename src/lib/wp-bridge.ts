/**
 * WordPress bridge client. Wraps the REST endpoints exposed by our
 * SEO Tool Bridge plugin (wordpress-plugin/seo-tool-bridge.php).
 *
 * Endpoints (under wp-json/seo-tool/v1/):
 *   GET  /ping                       — health check
 *   GET  /post/{id}/seo              — current title / meta / canonical
 *   POST /post/{id}/seo              — patch title / meta / canonical / robots
 *   POST /attachment/{id}/alt        — set alt text on a media item
 *   POST /post/{id}/schema           — replace inline JSON-LD schema block
 *   GET  /find?url=...               — resolve a public URL to a post ID
 *
 * All calls authenticate with a bearer-style key passed in the
 * `X-STB-Key` header. Per-client creds live on the `clients` table.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { decrypt } from "@/lib/crypto";

export type WpCreds = { endpoint: string; key: string };

/**
 * SSRF guard. Rejects URLs that resolve to loopback, link-local, or
 * RFC1918 private space. The wpEndpoint field is user-controlled (or
 * anyone-who-can-write-the-clients-table-controlled) and gets fetched
 * with our Bearer key in the X-STB-Key header — if an attacker pointed
 * it at http://169.254.169.254/ (AWS IMDSv1) or http://localhost:6379/
 * (Redis), our key would leak to that internal endpoint and we'd
 * happily forward any response back.
 *
 * Returns null when the URL is safe to fetch; returns an error message
 * when it's not.
 *
 * SEO_ALLOW_PRIVATE_WP_ENDPOINT=1 turns the private-address rules off.
 * That exists because blocking them outright is wrong for this product:
 * a self-hoster running WordPress in the same compose stack, or on
 * 192.168.x.x on their own LAN, is a normal setup and could not connect
 * at all. It's opt-in and off by default so the protection still holds
 * for anyone who hasn't thought about it, and it never disables the
 * protocol check — file:// and gopher:// stay refused either way.
 */
function rejectIfPrivateUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Only http(s) URLs allowed (got ${parsed.protocol})`;
  }
  if (process.env.SEO_ALLOW_PRIVATE_WP_ENDPOINT === "1") return null;
  const h = parsed.hostname.toLowerCase();
  // Bare hostnames / aliases that resolve to the local machine
  if (
    h === "localhost" ||
    h === "ip6-localhost" ||
    h === "ip6-loopback" ||
    h.endsWith(".localhost")
  ) {
    return "Endpoint points at localhost";
  }
  // IPv4 literals — loopback, link-local, RFC 1918
  if (/^127\./.test(h)) return "Endpoint is loopback (127.x.x.x)";
  if (/^169\.254\./.test(h)) return "Endpoint is link-local (169.254.x.x — cloud metadata)";
  if (/^10\./.test(h)) return "Endpoint is private (10.x.x.x)";
  if (/^192\.168\./.test(h)) return "Endpoint is private (192.168.x.x)";
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return "Endpoint is private (172.16-31.x.x)";
  if (/^0\./.test(h)) return "Endpoint is 0.0.0.0/8 (invalid)";
  // IPv6 literals — loopback + link-local + unique-local
  if (h === "::1" || h === "[::1]") return "Endpoint is IPv6 loopback";
  if (/^\[?(fe80|fc|fd)/i.test(h)) return "Endpoint is IPv6 link-local / unique-local";
  return null;
}

export async function getClientWpCreds(
  clientId: number,
): Promise<WpCreds | null> {
  const [c] = await db
    .select({ endpoint: clients.wpEndpoint, key: clients.wpKey })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!c?.endpoint || !c?.key) return null;
  // Decrypt at-rest WP application password (no-op for legacy plaintext rows).
  // Fail closed if decryption fails — we never want to forward `enc:v1:...`
  // ciphertext as the X-STB-Key Bearer header to the remote WordPress site.
  const key = decrypt(c.key);
  if (!key) return null;
  return { endpoint: c.endpoint.replace(/\/+$/, ""), key };
}

async function wpFetch<T>(
  creds: WpCreds,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const url = `${creds.endpoint}${path}`;
  const ssrfErr = rejectIfPrivateUrl(url);
  if (ssrfErr) {
    return { ok: false, status: 0, error: ssrfErr };
  }
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-STB-Key": creds.key,
        accept: "application/json",
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      // A 401 here almost always means an out-of-date plugin rather than
      // a wrong key. Bridge plugins before 0.4.0 only read the
      // `Authorization` header while this client has only ever sent
      // `X-STB-Key`, so every request failed however correct the key
      // was — and "401" on its own sends people to re-copy a key that
      // was never the problem.
      if (res.status === 401) {
        return {
          ok: false,
          status: 401,
          error:
            "WordPress rejected the connection key. If the SEO Tool Bridge plugin on that site is older than 0.4.0, update it — earlier versions couldn't read the header this tool sends, so the key never got through. Otherwise re-copy the key from Tools → SEO Tool Bridge.",
        };
      }
      return {
        ok: false,
        status: res.status,
        error: body.slice(0, 300) || res.statusText,
      };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: (err as Error).message ?? "network error",
    };
  }
}

export async function pingWpBridge(creds: WpCreds): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  // The plugin sends `plugin_version`. This read `version`, so it was
  // always undefined — and `hasPluginVersion(undefined, "0.3.0")` is
  // false, which meant alt-text capability could never open on a real
  // site no matter which plugin version was installed. `version` is
  // still accepted in case an older build ever sent it.
  type Resp = { plugin_version?: string; version?: string; ok?: boolean };
  const r = await wpFetch<Resp>(creds, "/ping", { method: "GET" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, version: r.data.plugin_version ?? r.data.version };
}

export type PostSeo = {
  id: number;
  url: string;
  title: string;
  metaDescription: string;
  canonical: string | null;
  robots: string | null;
};

/**
 * The plugin's wire format, which is snake_case and not the shape the
 * rest of this codebase wants. Mapped explicitly below rather than cast,
 * because casting is what hid the mismatch: this returned `r.data` as a
 * `PostSeo`, so `seo.metaDescription` was `undefined` on every call. The
 * agent read that as "this page has no meta description", recorded null
 * as the value to restore, and its post-write verification could never
 * match. Undo would have blanked a description that already existed.
 */
type WirePostSeo = {
  id?: number;
  title?: string;
  meta_description?: string;
  permalink?: string;
  status?: string;
  modified?: string;
};

export async function getPostSeo(
  creds: WpCreds,
  postId: number,
): Promise<{ ok: true; seo: PostSeo } | { ok: false; error: string }> {
  const r = await wpFetch<WirePostSeo>(creds, `/post/${postId}/seo`, {
    method: "GET",
  });
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    seo: {
      id: r.data.id ?? postId,
      url: r.data.permalink ?? "",
      title: r.data.title ?? "",
      metaDescription: r.data.meta_description ?? "",
      // The plugin doesn't report these yet. Null means "unknown", not
      // "absent" — nothing should write a canonical based on this.
      canonical: null,
      robots: null,
    },
  };
}

export async function setPostSeo(
  creds: WpCreds,
  postId: number,
  patch: Partial<{
    title: string;
    metaDescription: string;
    canonical: string;
    robots: string;
  }>,
): Promise<{ ok: boolean; error?: string }> {
  // snake_case on the wire. Sending `metaDescription` meant the plugin's
  // `isset($body['meta_description'])` was false, so it changed nothing
  // and still answered `{ok: true, changes: []}` — a write that reported
  // success and did nothing.
  const body: Record<string, string> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.metaDescription !== undefined) {
    body.meta_description = patch.metaDescription;
  }

  // The plugin's update handler reads `title` and `meta_description` and
  // nothing else, so a canonical or robots value sent here was accepted,
  // ignored, and answered with `ok: true`. Two "apply fix" buttons told
  // users the change had been made to their site when it hadn't. Say so
  // instead — a refusal the user can act on beats a success they can't
  // trust.
  const unsupported = (["canonical", "robots"] as const).filter(
    (f) => patch[f] !== undefined,
  );
  if (unsupported.length > 0) {
    return {
      ok: false,
      error: `The SEO Tool Bridge plugin can't write ${unsupported.join(" or ")} yet. Change it in your SEO plugin (Yoast, Rank Math) for now.`,
    };
  }

  if (Object.keys(body).length === 0) {
    return { ok: false, error: "Nothing to write." };
  }
  const r = await wpFetch<{ ok: boolean; changes?: unknown[] }>(
    creds,
    `/post/${postId}/seo`,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function setAttachmentAlt(
  creds: WpCreds,
  attachmentId: number,
  alt: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await wpFetch<{ ok: boolean }>(
    creds,
    `/attachment/${attachmentId}/alt`,
    { method: "POST", body: JSON.stringify({ alt }) },
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function setPostSchema(
  creds: WpCreds,
  postId: number,
  schemaJsonLd: string,
): Promise<{ ok: boolean; error?: string }> {
  // The plugin reads `jsonld`, all lowercase. Sending `jsonLd` meant it
  // saw an empty value and answered 400 "jsonld required" — so every
  // schema write the agent could plan would have failed on a real site,
  // including the one the contract test asserts is now executable.
  const r = await wpFetch<{ ok: boolean }>(
    creds,
    `/post/${postId}/schema`,
    { method: "POST", body: JSON.stringify({ jsonld: schemaJsonLd }) },
  );
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

/**
 * Create a new WordPress post via the plugin. Used by the daily-automation
 * publish step when a blog_draft queue item is approved.
 *
 * Uses `POST /wp-json/seo-tool/v1/posts`, which the bridge plugin has
 * had since 0.2.0. (This said "requires plugin v2.0+" — there has never
 * been a 2.x; the plugin is on 0.3.x. Wrong version claims in this file
 * have already caused one real bug, so it is worth being exact.)
 * A plugin without the route 404s; the caller treats that as "publisher
 * not available" and the queue item stays approved for the user to copy
 * out manually.
 *
 * `status` is "draft" by default — the user reviews in WP admin before
 * publishing. Schedules with auto_publish=true should pass "publish".
 */
export async function createWpPost(
  creds: WpCreds,
  input: {
    title: string;
    content: string;
    excerpt?: string;
    status?: "draft" | "publish";
    schemaJsonLd?: unknown;
    metaDescription?: string;
  },
): Promise<{ ok: true; id: number; url: string } | { ok: false; error: string }> {
  type Resp = { id: number; url: string };
  const r = await wpFetch<Resp>(creds, "/posts", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      excerpt: input.excerpt ?? "",
      status: input.status ?? "draft",
      schemaJsonLd: input.schemaJsonLd ?? null,
      metaDescription: input.metaDescription ?? "",
    }),
  });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.status === 404
          ? "WordPress plugin needs upgrading (no /posts endpoint). Reinstall the SEO Tool Bridge plugin."
          : r.error,
    };
  }
  return { ok: true, id: r.data.id, url: r.data.url };
}

/**
 * Try to resolve a public URL to a post ID. The plugin's /find endpoint
 * does this; if it 404s we fall back to fetching the URL and parsing the
 * `<link rel="shortlink">` header for `?p=<id>`.
 */
export async function findPostIdByUrl(
  creds: WpCreds,
  url: string,
): Promise<number | null> {
  type Resp = { id?: number };
  const params = new URLSearchParams({ url });
  const r = await wpFetch<Resp>(creds, `/find?${params.toString()}`, {
    method: "GET",
  });
  if (r.ok && typeof r.data.id === "number") return r.data.id;

  // Fallback: scrape the page for the WP "shortlink" with ?p=<id>.
  // Apply the SAME SSRF guard here — the `url` parameter is caller-
  // controlled and `redirect: "follow"` could chain into an internal IP.
  if (rejectIfPrivateUrl(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const m = html.match(/[?&]p=(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

// =====================================================================
// Plugin 0.3.0 — images, schema read, internal links
// =====================================================================

export type WpPostImage = {
  attachmentId: number | null;
  src: string;
  alt: string;
  /** False when we can't resolve an attachment id — alt text is unfixable. */
  fixable: boolean;
};

/**
 * Images on a post, with the attachment ids needed to write alt text.
 *
 * The missing link, literally. `setAttachmentAlt` has always existed but
 * takes an attachment id, and an audit finding gives a page URL and an
 * `<img src>`. Nothing mapped one to the other, so the agent could find
 * images with no alt text and never fix a single one.
 *
 * Returns [] against a plugin older than 0.3.0 rather than throwing —
 * the endpoint simply won't exist, and a user who hasn't updated should
 * see "can't do this yet", not an error.
 */
export async function getPostImages(
  creds: WpCreds,
  postId: number,
): Promise<{ ok: true; images: WpPostImage[] } | { ok: false; error: string }> {
  type R = { ok?: boolean; images?: WpPostImage[] };
  const r = await wpFetch<R>(creds, `/post/${postId}/images`, { method: "GET" });
  if (!r.ok) {
    if (r.status === 404) {
      return {
        ok: false,
        error:
          "This site's SEO Tool Bridge plugin is older than 0.3.0 and can't list images. Update the plugin to let the agent fix alt text.",
      };
    }
    return { ok: false, error: r.error };
  }
  return { ok: true, images: r.data.images ?? [] };
}

/**
 * The JSON-LD this plugin previously wrote for a post.
 *
 * Only markup the plugin manages — schema from Yoast, Rank Math or a
 * theme is deliberately not reported, because this is used to decide
 * whether the agent may overwrite. Claiming ownership of another
 * plugin's markup would let the agent destroy it.
 */
export async function getPostSchema(
  creds: WpCreds,
  postId: number,
): Promise<{ ok: true; managedJsonLd: string } | { ok: false; error: string }> {
  type R = { ok?: boolean; managedJsonLd?: string };
  const r = await wpFetch<R>(creds, `/post/${postId}/schema`, { method: "GET" });
  if (!r.ok) {
    if (r.status === 404) {
      return {
        ok: false,
        error:
          "This site's plugin is older than 0.3.0 and can't report existing schema.",
      };
    }
    return { ok: false, error: r.error };
  }
  return { ok: true, managedJsonLd: r.data.managedJsonLd ?? "" };
}

export type InsertedLink = { anchor: string; url: string };
export type SkippedLink = { anchor: string; reason: string };

/**
 * Insert internal links into a post's body.
 *
 * The only write in this file that touches post CONTENT rather than a
 * metadata field, which is a different risk class: a bad write damages
 * the article, not a tag. The plugin enforces the guards (visible text
 * only, first occurrence, never inside an existing link or heading or
 * code block, same-site URLs only) and stores the entire previous body
 * so undo is exact.
 *
 * `changed: false` with a populated `skipped` is a normal outcome — it
 * means every anchor was already linked or wasn't found in visible text.
 * That is information, not failure.
 */
export async function insertInternalLinks(
  creds: WpCreds,
  postId: number,
  links: { anchor: string; url: string }[],
): Promise<
  | {
      ok: true;
      changed: boolean;
      inserted: InsertedLink[];
      skipped: SkippedLink[];
      revId?: number;
    }
  | { ok: false; error: string }
> {
  type R = {
    ok?: boolean;
    changed?: boolean;
    inserted?: InsertedLink[];
    skipped?: SkippedLink[];
    rev_id?: number;
  };
  const r = await wpFetch<R>(creds, `/post/${postId}/links`, {
    method: "POST",
    body: JSON.stringify({ links }),
  });
  if (!r.ok) {
    if (r.status === 404) {
      return {
        ok: false,
        error:
          "This site's SEO Tool Bridge plugin is older than 0.3.0 and can't insert links. Update the plugin first.",
      };
    }
    return { ok: false, error: r.error };
  }
  return {
    ok: true,
    changed: Boolean(r.data.changed),
    inserted: r.data.inserted ?? [],
    skipped: r.data.skipped ?? [],
    revId: r.data.rev_id,
  };
}
