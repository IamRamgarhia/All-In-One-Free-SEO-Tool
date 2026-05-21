import { NextResponse } from "next/server";
import { getUiMode, setUiMode } from "@/app/settings/ui-actions";

/**
 * Flip ui.mode between "guided" and "pro". POSTed to from the sidebar
 * footer toggle. We use a tiny endpoint instead of a server action
 * directly on the form so the form can live inside a "use client"
 * Sidebar — server actions on client components require passing the
 * function down as a prop, which adds noise.
 *
 * Redirects back to the referer (or `/`) so the user stays put.
 */
export async function POST(req: Request) {
  const current = await getUiMode();
  await setUiMode(current === "guided" ? "pro" : "guided");
  const referer = req.headers.get("referer");
  return NextResponse.redirect(referer ?? new URL("/", req.url), 303);
}
