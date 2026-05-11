/**
 * Auth status — lets the client know whether APP_PASSWORD is configured,
 * so the UI can hide / show the Sign-out button accordingly. Returns
 * only the boolean — never echoes the password itself.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    enabled: Boolean(process.env.APP_PASSWORD),
  });
}
