import { assertClientParam } from "@/lib/client-scope";

/**
 * A layout that does nothing but refuse requests for clients the signed-in
 * user isn't assigned to.
 *
 * It exists as a layout rather than a call inside each page because a
 * layout can't be forgotten: whoever adds the 28th per-client route gets
 * the check by putting their page in the folder. A helper you have to
 * remember to call is a helper that eventually isn't called, and the one
 * page that misses it is the whole hole.
 *
 * Re-exported by a one-line `layout.tsx` in every per-client route
 * segment (the `c/[clientId]` folders, plus `clients/[id]`). Next.js has
 * no way to express one layout across sibling route trees, so the
 * one-liners are the cost of the guarantee.
 */
export default async function ClientScopeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId?: string; id?: string }>;
}) {
  const p = await params;
  await assertClientParam(p.clientId ?? p.id);
  return <>{children}</>;
}
