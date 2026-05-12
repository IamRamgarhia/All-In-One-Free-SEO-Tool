"use server";

import { revalidatePath } from "next/cache";
import { getSetting, setSetting } from "@/lib/settings-store";
import { closeBrowser, checkProxyHealth, type ProxyHealth } from "@/lib/browser-pool";

export type BrowserSettingsState =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function saveBrowserSettings(
  _prev: BrowserSettingsState | null,
  formData: FormData,
): Promise<BrowserSettingsState> {
  const concRaw = formData.get("maxConcurrency");
  const conc = concRaw ? Number(concRaw) : 4;
  if (!Number.isFinite(conc) || conc < 1 || conc > 16) {
    return {
      ok: false,
      error: "Concurrency must be between 1 and 16.",
    };
  }
  const proxiesRaw = String(formData.get("proxies") ?? "")
    .trim()
    .replace(/\r/g, "");
  const stealth = formData.get("stealth") === "on";

  // Cookies: parse "domain TAB name TAB value" lines OR raw cookie-header pairs
  const cookiesRaw = String(formData.get("cookies") ?? "")
    .trim()
    .replace(/\r/g, "");
  const cookies = parseCookieLines(cookiesRaw);

  const remoteWs = String(formData.get("remoteWs") ?? "").trim();
  const disableRank = formData.get("disableRank") === "on";
  const disableCwv = formData.get("disableCwv") === "on";
  const disableSerp = formData.get("disableSerp") === "on";
  const allowGbpScraper = formData.get("allowGbpScraper") === "on";

  await setSetting("browser.max_concurrency", conc);
  await setSetting("browser.proxies", proxiesRaw);
  await setSetting("browser.stealth_enabled", stealth);
  await setSetting("browser.cookies", cookies);
  await setSetting("browser.remote_ws", remoteWs);
  await setSetting("browser.disable_rank_check", disableRank);
  await setSetting("browser.disable_local_cwv", disableCwv);
  await setSetting("browser.disable_serp_scan", disableSerp);
  // Allow checkbox is inverted — the underlying flag stores "disable"
  // semantics so the default (undefined) reads as disabled.
  await setSetting("browser.disable_gbp_scraper", !allowGbpScraper);

  // Force-close the browser so the next launch picks up new settings
  // (especially the remote WS endpoint switch).
  await closeBrowser();

  revalidatePath("/settings");
  return { ok: true, message: "Saved. Browser will relaunch on next use." };
}

type StoredCookie = {
  domain: string;
  name: string;
  value: string;
  path?: string;
};

function parseCookieLines(raw: string): StoredCookie[] {
  if (!raw) return [];
  const out: StoredCookie[] = [];
  for (const line of raw.split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    // Format A: domain<TAB>name<TAB>value
    const tabParts = t.split(/\t+/);
    if (tabParts.length >= 3) {
      out.push({
        domain: tabParts[0].replace(/^\./, ""),
        name: tabParts[1],
        value: tabParts[2],
      });
      continue;
    }
    // Format B: "domain.com: name=value; name2=value2"
    const m = t.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const domain = m[1].trim().replace(/^\./, "");
      for (const pair of m[2].split(/;/)) {
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (name && value) out.push({ domain, name, value });
      }
    }
  }
  return out;
}

export type ProxyHealthState =
  | { ok: true; results: ProxyHealth[] }
  | { ok: false; error: string };

export async function testProxies(): Promise<ProxyHealthState> {
  try {
    const results = await checkProxyHealth();
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function loadBrowserSettings() {
  const cookies =
    (await getSetting<StoredCookie[]>("browser.cookies")) ?? [];
  const cookiesText = cookies
    .map((c) => `${c.domain}\t${c.name}\t${c.value}`)
    .join("\n");
  // GBP scraper allow-flag is inverted (storage uses "disable" semantics
  // so the default `undefined` reads as disabled). Surface as "allow" in
  // the form so the user makes the active choice to enable it.
  const gbpScraperDisabled =
    (await getSetting<boolean>("browser.disable_gbp_scraper")) ?? true;
  return {
    maxConcurrency:
      (await getSetting<number>("browser.max_concurrency")) ?? 4,
    proxies: (await getSetting<string>("browser.proxies")) ?? "",
    stealth: ((await getSetting<boolean>("browser.stealth_enabled")) ?? true),
    cookies: cookiesText,
    cookieCount: cookies.length,
    remoteWs: (await getSetting<string>("browser.remote_ws")) ?? "",
    disableRank:
      (await getSetting<boolean>("browser.disable_rank_check")) ?? false,
    disableCwv:
      (await getSetting<boolean>("browser.disable_local_cwv")) ?? false,
    disableSerp:
      (await getSetting<boolean>("browser.disable_serp_scan")) ?? false,
    allowGbpScraper: !gbpScraperDisabled,
  };
}
