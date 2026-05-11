"use server";

import { saveToolRun } from "@/lib/tool-runs";

export type WaybackSnap = {
  ts: string;
  url: string;
  status: string;
  archiveUrl: string;
};

export type WaybackState =
  | { ok: true; url: string; snaps: WaybackSnap[] }
  | { ok: false; error: string };

export async function runWayback(
  _prev: WaybackState | null,
  formData: FormData,
): Promise<WaybackState> {
  const raw = String(formData.get("url") ?? "").trim();
  if (!raw) return { ok: false, error: "Enter a URL." };
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  // Internet Archive CDX API — free, no key.
  const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
    url,
  )}&output=json&limit=80&filter=statuscode:200&fl=timestamp,original,statuscode,mimetype&collapse=timestamp:6`;
  try {
    const res = await fetch(cdxUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; SeoToolBot/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Internet Archive returned ${res.status}` };
    }
    const data = (await res.json()) as string[][];
    if (!Array.isArray(data) || data.length <= 1) {
      return {
        ok: true,
        url,
        snaps: [],
      };
    }
    // First row is the header
    const rows = data.slice(1);
    const snaps: WaybackSnap[] = rows
      .map((r) => {
        const [ts, original, status] = r;
        return {
          ts,
          url: original,
          status,
          archiveUrl: `https://web.archive.org/web/${ts}/${original}`,
        };
      })
      .filter((s) => s.ts && /^\d{14}$/.test(s.ts))
      .sort((a, b) => b.ts.localeCompare(a.ts));
    await saveToolRun({
      toolId: "wayback",
      label: `${url} · ${snaps.length} snapshots`,
      input: { url },
      result: { ok: true, url, snaps },
    }).catch(() => undefined);
    return { ok: true, url, snaps };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? "Wayback fetch failed" };
  }
}
