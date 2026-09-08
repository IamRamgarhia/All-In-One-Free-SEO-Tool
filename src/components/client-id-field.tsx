"use client";

import { useSearchParams } from "next/navigation";
import { CLIENT_ID_FIELD } from "@/lib/client-id-field";

/**
 * Carries the client id from the URL into a tool's form submission.
 *
 * A tool opened from a client's rail arrives at `?url=...&clientId=42`.
 * The URL pre-fills a visible input, but the client id has nowhere to go
 * — server actions receive FormData, not the page's query string — so it
 * was being dropped on the floor between the link and the action.
 *
 * The consequence was invisible: the tool worked, showed its answer, and
 * saved a run belonging to nobody. Findings written that way fail the
 * clientId filter in `loadActionableToolFindings` and reach neither the
 * agent nor the ranked list.
 *
 * Drop this inside a tool's <form> and read `clientId` from FormData in
 * the action. `clientIdFrom` below is the matching reader, so the name
 * of the field lives in one place.
 */
export function ClientIdField() {
  const id = useClientId();
  if (id === null) return null;
  return <input type="hidden" name={CLIENT_ID_FIELD} value={String(id)} />;
}

/**
 * The same id, for tools that call their action directly.
 *
 * Roughly half the tool pages use a <form> and a server action, and the
 * other half call the action from a `startTransition` with plain
 * arguments. The second kind has no FormData to put a hidden field in,
 * so it reads the id here and passes it as an argument.
 */
export function useClientId(): number | null {
  const params = useSearchParams();
  const raw = params?.get(CLIENT_ID_FIELD) ?? "";
  // Only forward something that is actually an id. A junk query param
  // should mean "no client", not a foreign-key error at insert time.
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
