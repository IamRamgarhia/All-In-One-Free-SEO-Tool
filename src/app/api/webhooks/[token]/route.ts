import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inboundWebhooks, inboundWebhookEvents } from "@/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: Request, params: { token: string }) {
  const { token } = params;
  if (!token || token.length < 16) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // Per-token rate limit — caps abuse if a token leaks. 600 req/min
  // (10/sec) is far above legitimate webhook traffic.
  const limit = checkRateLimit(`webhook:${token}`, {
    max: 600,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded for this token." }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(
            Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000)),
          ),
        },
      },
    );
  }

  const [hook] = await db
    .select()
    .from(inboundWebhooks)
    .where(eq(inboundWebhooks.token, token))
    .limit(1);
  if (!hook) {
    return new Response(JSON.stringify({ error: "Webhook not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  if (!hook.enabled) {
    return new Response(JSON.stringify({ error: "Webhook disabled" }), {
      status: 410,
      headers: { "content-type": "application/json" },
    });
  }

  // Read body up to 256 KB
  let payload: unknown = null;
  try {
    const text = await req.text();
    if (text.length > 262_144) {
      return new Response(
        JSON.stringify({ error: "Payload too large (>256KB)" }),
        { status: 413, headers: { "content-type": "application/json" } },
      );
    }
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // Not JSON — store as raw text
        payload = { _raw: text };
      }
    } else {
      payload = {};
    }
  } catch {
    payload = { _raw: null };
  }

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    // Skip noisy + sensitive headers
    if (/^cookie$|^authorization$/i.test(k)) return;
    if (k.startsWith("cf-") || k.startsWith("x-vercel-")) return;
    headers[k] = v.slice(0, 500);
  });

  const sourceIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  await db.insert(inboundWebhookEvents).values({
    webhookId: hook.id,
    payload,
    headers,
    sourceIp,
  });

  await db
    .update(inboundWebhooks)
    .set({
      lastReceivedAt: new Date(),
      receiveCount: sql`${inboundWebhooks.receiveCount} + 1`,
    })
    .where(eq(inboundWebhooks.id, hook.id));

  return new Response(JSON.stringify({ ok: true, received: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const params = await context.params;
  return handle(req, params);
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const params = await context.params;
  return handle(req, params);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const params = await context.params;
  return handle(req, params);
}
