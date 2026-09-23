"use client";

import { useSearchParams } from "next/navigation";

/**
 * The URL a tool was opened with, from `?url=`.
 *
 * The "Tools for this client" launcher deep-links here with the client's
 * domain already in the query string. Eight of the nine tools it links to
 * ignored it and rendered an empty box, so picking a client and then
 * picking a tool asked you to type the domain you had just chosen — which
 * reads as the app having forgotten which client you were on.
 *
 * A hook rather than four lines copied into each page: the copied version
 * was written once, correctly, in sxo/page.tsx and never reached the
 * others.
 */
export function usePresetUrl(): string {
  const params = useSearchParams();
  return params?.get("url") ?? "";
}

/**
 * A tool's starting mode, from `?mode=`.
 *
 * Added because a link was written that set `?mode=local` and a select
 * whose default was hardcoded `"psi"` ignored it — the link navigated,
 * the page looked identical, and the user was left to conclude the
 * button did nothing. A query param that nothing reads is a dead
 * control, and this file exists because that had already happened eight
 * times with `?url=`.
 */
export function usePresetMode<T extends string>(
  allowed: readonly T[],
  fallback: T,
): T {
  const params = useSearchParams();
  const raw = params?.get("mode");
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** The client a tool was opened for, from `?clientId=`. */
export function usePresetClientId(): number | null {
  const params = useSearchParams();
  const raw = params?.get("clientId");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
