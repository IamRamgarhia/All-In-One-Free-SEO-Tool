import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";

/**
 * Which client the person is looking at, without asking the caller.
 *
 * The audit that prompted this found 78 of 91 tools unable to receive a
 * clientId at all. A tool opened from a client's rail therefore recorded
 * its run — and any findings — against nobody, so the result reached
 * neither the ranked list, nor the agent, nor a report. The page looked
 * perfect, which is why it went unnoticed for so long.
 *
 * The obvious fix is to thread a parameter through 78 tools. The better
 * one is to stop requiring anybody to remember: a server action runs
 * inside a request, and that request's Referer is the page the user is
 * on — `/tools/robots?url=…&clientId=4`. The id is already there.
 *
 * So callers may still pass one explicitly, and that always wins. This
 * is the fallback for every tool that never learned to.
 *
 * Trust: the Referer is client-controlled, and in a multi-tenant app
 * that would matter. This one is single-user and self-hosted — the
 * person sending the header is the person the data belongs to — and the
 * worst case is a tool run filed against the wrong client of their own,
 * which is visible and fixable. Set against 78 tools that currently file
 * against nothing at all, that is the right trade.
 */
/**
 * The client a background job is currently working on.
 *
 * The referer trick below only works inside a request, and the nightly
 * sweep is not one — it is a bare interval in the Node process. Without
 * this, every swept run would be filed against nobody, which is the
 * exact failure the referer fallback exists to prevent, arriving through
 * a different door.
 *
 * AsyncLocalStorage rather than a module-level variable because the
 * sweep runs clients in sequence but the checks inside it are async, and
 * a plain variable would leak one client's id into another's run the
 * moment anything ran concurrently.
 */
const backgroundClient = new AsyncLocalStorage<number>();

/**
 * Run `fn` with every tool run inside it attributed to this client.
 *
 * Anything the tools call — saveToolRun, recordToolRun — picks the id up
 * without being passed it, so the sweep can run a tool that has never
 * heard of clients and still file the result correctly.
 */
export function withClientContext<T>(clientId: number, fn: () => Promise<T>) {
  return backgroundClient.run(clientId, fn);
}

export async function clientIdFromRequest(): Promise<number | null> {
  // A background job that declared who it is working for. Checked first
  // because it is explicit, where the referer is inferred.
  const fromJob = backgroundClient.getStore();
  if (typeof fromJob === "number") return fromJob;

  let referer: string | null = null;
  try {
    referer = (await headers()).get("referer");
  } catch {
    // No request context — the scheduler, a script, a test. Nothing to
    // read, and nothing wrong with that.
    return null;
  }
  if (!referer) return null;

  try {
    return parseClientId(new URL(referer).searchParams.get("clientId"));
  } catch {
    return null;
  }
}

/**
 * A usable client id, or null.
 *
 * Exported so the parsing rule lives in one place: a junk value has to
 * mean "no client", never a foreign-key error at insert time.
 */
export function parseClientId(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const id = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
