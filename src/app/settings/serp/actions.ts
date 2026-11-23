"use server";

import { revalidatePath } from "next/cache";
import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireSettingsAdmin } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { deleteSetting, getSetting, setSetting } from "@/lib/settings-store";
import { fetchSerpViaApi, isSerpProvider, serpApiConfig } from "@/lib/serp-api";

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
