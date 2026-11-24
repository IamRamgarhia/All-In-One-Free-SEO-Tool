"use server";

import { revalidatePath } from "next/cache";
import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireSettingsAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";
import { fetchSerpViaApi, isSerpProvider, serpApiConfig } from "@/lib/serp-api";
import { closeBrowser, isLoopbackCdpUrl } from "@/lib/browser-pool";
import { testLiveEngines } from "@/lib/rank-checker";
import { getBraveApiKey, getSearxngUrl } from "@/lib/serp";
import { createBraveProvider } from "@/lib/serp/brave";
import { describeRankFailure, type RankTx } from "@/lib/serp/describe";
import { createSearxngProvider, normaliseInstanceUrl } from "@/lib/serp/searxng";

export type SerpSaveState = { ok: true } | { ok: false; error: string } | null;

/**
 * Save the provider and its credentials. A blank secret keeps the stored
 * one, so the form never has to show it back.
 */
export async function saveSerpSettings(_prev: SerpSaveState, formData: FormData): Promise<SerpSaveState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("settings.serp");
  const provider = String(formData.get("provider") ?? "");

  if (provider === "none") {
    await deleteSetting("serp.provider");
    revalidatePath("/settings/serp");
    return { ok: true };
  }
  if (!isSerpProvider(provider)) return { ok: false, error: tx("errorProvider") };

  if (provider === "serper") {
    const key = String(formData.get("serperKey") ?? "").trim();
    if (key) await setSetting("serp.serper_key", encrypt(key));
    else if (!(await getSetting<string>("serp.serper_key"))) return { ok: false, error: tx("errorSerperKey") };
  } else {
    const login = String(formData.get("dataforseoLogin") ?? "").trim();
    const password = String(formData.get("dataforseoPassword") ?? "").trim();
    if (!login) return { ok: false, error: tx("errorDataforseoLogin") };
    await setSetting("serp.dataforseo_login", login);
    if (password) await setSetting("serp.dataforseo_password", encrypt(password));
    else if (!(await getSetting<string>("serp.dataforseo_password"))) {
      return { ok: false, error: tx("errorDataforseoPassword") };
    }
  }
  await setSetting("serp.provider", provider);
  revalidatePath("/settings/serp");
  return { ok: true };
}

/** Forget every credential and go back to the browser. */
export async function clearSerpSettings(): Promise<void> {
  await requireSettingsAdmin();
  await requireSignedIn();
  await Promise.all([
    deleteSetting("serp.provider"),
    deleteSetting("serp.serper_key"),
    deleteSetting("serp.dataforseo_login"),
    deleteSetting("serp.dataforseo_password"),
  ]);
  revalidatePath("/settings/serp");
}

export type SerpTestState =
  | { ok: true; provider: string; results: number }
  | { ok: false; error: string }
  | null;

/** One real search, billed by the provider like any other. */
export async function testSerpSettings(): Promise<SerpTestState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("settings.serp");
  const config = await serpApiConfig();
  if (!config) return { ok: false, error: tx("errorNotConfigured") };
  const r = await fetchSerpViaApi(config, { query: "référencement naturel", country: "FR", language: "fr", depth: 10 });
  return r.ok ? { ok: true, provider: r.provider, results: r.urls.length } : { ok: false, error: r.error };
}

// ── Keyless sources: SearXNG, Brave, the browser ─────────────────────

export type SourceSaveState = { ok: true } | { ok: false; error: string } | null;

/** The SearXNG address. Blank clears the setting (SEARXNG_URL then applies). */
export async function saveSearxngUrl(_prev: SourceSaveState, formData: FormData): Promise<SourceSaveState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("settings.serp");
  const raw = String(formData.get("searxngUrl") ?? "").trim();
  if (!raw) {
    await deleteSetting("serp.searxng_url");
    revalidatePath("/settings/serp");
    return { ok: true };
  }
  const url = normaliseInstanceUrl(raw);
  if (!url) return { ok: false, error: tx("errorSearxngUrl") };
  await setSetting("serp.searxng_url", url);
  revalidatePath("/settings/serp");
  return { ok: true };
}

/** The Brave key, encrypted at rest. Blank keeps the stored one. */
export async function saveBraveKey(_prev: SourceSaveState, formData: FormData): Promise<SourceSaveState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("settings.serp");
  const key = String(formData.get("braveKey") ?? "").trim();
  if (key) await setSetting("serp.brave_key", encrypt(key));
  else if (!(await getSetting<string>("serp.brave_key"))) return { ok: false, error: tx("errorBraveKey") };
  revalidatePath("/settings/serp");
  return { ok: true };
}

export async function clearBraveKey(): Promise<void> {
  await requireSettingsAdmin();
  await requireSignedIn();
  await deleteSetting("serp.brave_key");
  revalidatePath("/settings/serp");
}

/**
 * The address of the user's own Chrome (remote debugging). Loopback only:
 * a debugging port is unauthenticated control of a browser.
 */
export async function saveCdpUrl(_prev: SourceSaveState, formData: FormData): Promise<SourceSaveState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const tx = await actionTx("settings.serp");
  const raw = String(formData.get("cdpUrl") ?? "").trim();
  if (raw && !isLoopbackCdpUrl(raw)) return { ok: false, error: tx("errorCdpUrl") };
  if (raw) await setSetting("browser.cdp_url", raw);
  else await deleteSetting("browser.cdp_url");
  // The address decides which browser we attach to: drop any cached one.
  // closeBrowser() never closes a browser the user started.
  await closeBrowser();
  revalidatePath("/settings/serp");
  return { ok: true };
}

export type SourceTestState =
  | { ok: true; results: number; detail?: string }
  | { ok: false; error: string }
  | null;

async function testQuery() {
  const tx = await actionTx("settings.serp");
  return {
    tx,
    query: tx("testQuery"),
    country: tx("testCountry"),
    language: tx("testLanguage"),
  };
}

/** One real search through the configured SearXNG, reported as it went. */
export async function testSearxng(): Promise<SourceTestState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const { tx, query, country, language } = await testQuery();
  const rankTx = (await actionTx("rankCheck")) as unknown as RankTx;
  const configured = await getSearxngUrl();
  if (!configured) return { ok: false, error: tx("errorSearxngNotConfigured") };
  const r = await createSearxngProvider({ instanceUrl: configured.url }).lookup({
    query,
    domain: "example.invalid",
    country,
    language,
  });
  return r.ok
    ? { ok: true, results: r.resultsScanned, detail: r.engine }
    : { ok: false, error: describeRankFailure(rankTx, r.failure) + (r.failure.detail ? ` (${r.failure.detail})` : "") };
}

/** One real search through Brave, counted against its quota like any other. */
export async function testBrave(): Promise<SourceTestState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const { tx, query, country, language } = await testQuery();
  const rankTx = (await actionTx("rankCheck")) as unknown as RankTx;
  const key = await getBraveApiKey();
  if (!key) return { ok: false, error: tx("errorBraveNotConfigured") };
  const r = await createBraveProvider({ apiKey: key }).lookup({
    query,
    domain: "example.invalid",
    country,
    language,
  });
  return r.ok
    ? { ok: true, results: r.resultsScanned }
    : { ok: false, error: describeRankFailure(rankTx, r.failure) };
}

export type EnginesTestState = {
  google: SourceTestState;
  duckduckgo: SourceTestState;
} | null;

/**
 * One search on Google in the browser and one on DuckDuckGo, each
 * reported on its own — so a blocked Google is said, not hidden behind a
 * DuckDuckGo answer.
 */
export async function testBrowserEngines(): Promise<EnginesTestState> {
  await requireSettingsAdmin();
  await requireSignedIn();
  const { tx, query, country, language } = await testQuery();
  const rankTx = (await actionTx("rankCheck")) as unknown as RankTx;
  const r = await testLiveEngines({ query, country, language });
  await closeBrowser().catch(() => {});
  return {
    google: r.google.ok
      ? { ok: true, results: r.google.resultsScanned }
      : {
          ok: false,
          error: r.google.failure ? describeRankFailure(rankTx, r.google.failure) : tx("errorUnknown"),
        },
    duckduckgo: r.duckduckgo.ok
      ? { ok: true, results: r.duckduckgo.resultsScanned, detail: r.duckduckgo.region }
      : {
          ok: false,
          error: r.duckduckgo.failure
            ? describeRankFailure(rankTx, r.duckduckgo.failure)
            : tx("errorUnknown"),
        },
  };
}
