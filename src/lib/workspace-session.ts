import { cookies } from "next/headers";
import { expectedToken } from "@/middleware";
import { accountsEnabled, currentUser } from "@/lib/auth";
import { timingSafeEqual } from "@/lib/secure-compare";

/**
 * Whether this browser already passed the workspace gate (accounts session
 * or shared APP_PASSWORD cookie). Open installs with no gate always true.
 */
export async function hasWorkspaceSession(): Promise<boolean> {
  if (accountsEnabled()) {
    const user = await currentUser();
    return user !== null;
  }

  const required = process.env.APP_PASSWORD;
  if (!required) return true;

  const jar = await cookies();
  const cookie = jar.get("stb_auth")?.value;
  if (!cookie) return false;
  const expected = await expectedToken(required);
  return timingSafeEqual(cookie, expected);
}
