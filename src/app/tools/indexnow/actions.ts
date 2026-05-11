"use server";

import { z } from "zod";
import {
  getOrCreateIndexNowKey,
  submitToIndexNow,
  verifyKeyFile,
} from "@/lib/indexnow";
import { saveToolRun } from "@/lib/tool-runs";

const submitSchema = z.object({
  host: z.string().trim().min(3).max(255),
  urls: z.string().trim().min(1).max(200_000),
});

export type SubmitState =
  | {
      ok: true;
      submitted: number;
      status: number;
      key: string;
      keyUrl: string;
    }
  | { ok: false; error: string; status?: number; key?: string; keyUrl?: string };

export async function submitIndexNow(
  _prev: SubmitState | null,
  formData: FormData,
): Promise<SubmitState> {
  const parsed = submitSchema.safeParse({
    host: formData.get("host"),
    urls: formData.get("urls"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const urls = parsed.data.urls
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0) return { ok: false, error: "No URLs provided" };

  const key = await getOrCreateIndexNowKey();
  let host: string;
  try {
    host = new URL(
      /^https?:\/\//i.test(parsed.data.host)
        ? parsed.data.host
        : `https://${parsed.data.host}`,
    ).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "Invalid host" };
  }
  const keyUrl = `https://${host}/${key}.txt`;

  const result = await submitToIndexNow({ host, urls, key });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      status: result.status,
      key,
      keyUrl,
    };
  }
  await saveToolRun({
    toolId: "indexnow",
    label: `${host} · ${result.submitted} URLs · ${result.status}`,
    input: { host, urlCount: urls.length },
    result: {
      ok: true,
      submitted: result.submitted,
      status: result.status,
      key,
      keyUrl,
    },
  }).catch(() => undefined);
  return {
    ok: true,
    submitted: result.submitted,
    status: result.status,
    key,
    keyUrl,
  };
}

export async function verifyIndexNowKeyFile(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const host = String(formData.get("host") ?? "").trim();
  if (!host) return { ok: false, error: "Host required" };
  const key = await getOrCreateIndexNowKey();
  return await verifyKeyFile({ host, key });
}
