import { accountsEnabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Tells the Edge middleware which auth mode this install is in.
 *
 * This endpoint exists because of a genuine runtime boundary, not
 * because anyone wanted another route. Middleware runs in Next's Edge
 * sandbox, which cannot open better-sqlite3 — so it cannot count the
 * `users` table itself. The obvious workaround was for
 * `instrumentation.ts` to publish the answer on `process.env` at boot,
 * and that half-works: the Edge sandbox does read process.env, but only
 * the snapshot it was created with. A value written later by the Node
 * runtime — which is exactly what happens when the first owner registers
 * — never reaches it.
 *
 * The observable bug was ugly: register the first account on a running
 * instance and the app stayed wide open to anyone who could reach the
 * port, until someone restarted the server. On a self-hosted box that
 * runs for months, "until restart" means "indefinitely".
 *
 * So middleware asks. It caches the answer, and once the answer is
 * "accounts", it stops asking — enabling accounts is a one-way door.
 *
 * Deliberately returns nothing but the mode. No user, no count, no
 * hint about who is registered. It has to be reachable without a session
 * (middleware calls it before deciding whether the caller has one), so
 * it must be safe for an anonymous caller to read. "This instance uses
 * accounts" is the same thing the login page says out loud.
 */
export async function GET() {
  return Response.json(
    {
      mode: accountsEnabled()
        ? "accounts"
        : process.env.APP_PASSWORD
          ? "password"
          : "open",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
