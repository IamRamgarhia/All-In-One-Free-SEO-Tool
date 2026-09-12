import { edgeFixesForClient } from "@/lib/edge-fixes";
import { edgeTokenMatches } from "@/lib/edge-token";

/**
 * The fix set an edge worker fetches and applies.
 *
 * Called from Cloudflare, not from a browser, and it sits on the request
 * path of a live website — so the contract is: answer fast, answer the
 * same thing for five minutes, and never make the caller's problem
 * worse. The worker caches this and serves the origin untouched if it
 * cannot get an answer.
 *
 * Bearer token rather than the app's session: the caller is a machine
 * with no cookies, and the token is scoped to exactly this one read.
 */
export async function GET(req: Request) {
  const clientId = Number.parseInt(
    new URL(req.url).searchParams.get("client") ?? "",
    10,
  );
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return Response.json({ error: "client required" }, { status: 400 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!(await edgeTokenMatches(token))) {
    // 401 and nothing else. Saying whether the client id exists would
    // let an unauthenticated caller enumerate them.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const fixes = await edgeFixesForClient(clientId);
    return Response.json(fixes, {
      headers: {
        // The worker caches on its own too. This is for any proxy in
        // between, and it is short because a reverted fix has to stop
        // being served promptly.
        "cache-control": "public, max-age=60",
      },
    });
  } catch {
    // An empty set, not a 500. The worker treats a failed fetch as
    // "serve the origin unchanged", which is also what an empty set
    // does — but a 200 keeps its cache warm and stops it retrying on
    // every request while this app is having a bad minute.
    return Response.json(
      { pages: {}, generatedAt: new Date().toISOString(), count: 0 },
      { status: 200 },
    );
  }
}
