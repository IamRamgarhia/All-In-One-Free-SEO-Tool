"use server";

import { revalidatePath } from "next/cache";
import { getSetting, setSetting } from "@/lib/settings-store";
import { closeBrowser, isLoopbackCdpUrl } from "@/lib/browser-pool";
import { normaliseInstanceUrl } from "@/lib/serp/searxng";
import { guardAction } from "@/lib/action-guard";

export type RankSourcesState =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/**
 * What the form needs to render.
 *
 * The Brave key is deliberately NOT included — only whether one is set.
 * Echoing a stored secret back into the page puts it in the HTML, in
 * the browser cache and in any screen share, for no benefit: nobody
 * needs to read their own API key off a settings screen.
 */
export type RankSourcesSettings = {
  searxngUrl: string;
  braveKeySet: boolean;
  cdpUrl: string;
};

export async function loadRankSources(): Promise<RankSourcesSettings> {
  // Everything exported from a "use server" file is callable over the
  // network, so a read needs the same gate as a write — this one hands
  // back the SearXNG address and the Chrome debugging port, which are
  // not secrets but are not public either. action-guard.test.ts caught
  // the omission.
  await guardAction("settings");
  const key = await getSetting<string>("serp.brave_key");
  return {
    searxngUrl: (await getSetting<string>("serp.searxng_url")) ?? "",
    braveKeySet: Boolean(key && key.trim()),
    cdpUrl: (await getSetting<string>("browser.cdp_url")) ?? "",
  };
}

export async function saveRankSources(
  _prev: RankSourcesState | null,
  formData: FormData,
): Promise<RankSourcesState> {
  await guardAction("settings", formData.get("clientId"));

  const searxngRaw = String(formData.get("searxngUrl") ?? "").trim();
  let searxngUrl = "";
  if (searxngRaw) {
    const normalised = normaliseInstanceUrl(searxngRaw);
    if (!normalised) {
      return {
        ok: false,
        error: `"${searxngRaw}" isn't a URL. It should look like https://searx.example.com or http://localhost:8888.`,
      };
    }
    searxngUrl = normalised;
  }

  const cdpRaw = String(formData.get("cdpUrl") ?? "").trim();
  if (cdpRaw && !isLoopbackCdpUrl(cdpRaw)) {
    // Refuse rather than store-and-fail-later. A debugging port is
    // unauthenticated control of a browser, so the one thing this field
    // must never do is quietly accept somebody else's machine.
    return {
      ok: false,
      error:
        `"${cdpRaw}" isn't on this machine. A Chrome debugging port is ` +
        `complete, unauthenticated control of that browser, so only ` +
        `http://127.0.0.1:<port> or http://localhost:<port> is accepted.`,
    };
  }

  // Blank means "leave it alone" for a secret, because the form never
  // renders the current value — a blank box is the normal state, not an
  // instruction to delete. Clearing is its own explicit checkbox.
  const braveRaw = String(formData.get("braveKey") ?? "").trim();
  const clearBrave = formData.get("clearBraveKey") === "on";

  await setSetting("serp.searxng_url", searxngUrl);
  await setSetting("browser.cdp_url", cdpRaw);
  if (clearBrave) {
    await setSetting("serp.brave_key", "");
  } else if (braveRaw) {
    await setSetting("serp.brave_key", braveRaw);
  }

  // The CDP endpoint decides which browser we attach to, so a change
  // must not be masked by a cached connection.
  await closeBrowser();

  revalidatePath("/settings");
  return { ok: true, message: "Saved. The next rank check uses these." };
}
