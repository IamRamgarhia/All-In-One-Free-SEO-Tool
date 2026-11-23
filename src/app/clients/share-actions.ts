"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireClientAccess } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

function generateToken(): string {
  // 24 random bytes → 32 chars urlsafe base64. Plenty of entropy for an
  // unlisted share link.
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generateShareToken(clientId: number): Promise<void> {
  await requireSignedIn();
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  await requireClientAccess(clientId, { edit: true });
  let attempts = 0;
  while (attempts < 5) {
    const token = generateToken();
    try {
      await db
        .update(clients)
        .set({ shareToken: token, updatedAt: new Date() })
        .where(eq(clients.id, clientId));
      revalidatePath(`/clients/${clientId}`);
      return;
    } catch {
      attempts++;
    }
  }
}

export async function revokeShareToken(clientId: number): Promise<void> {
  await requireSignedIn();
  if (!Number.isFinite(clientId) || clientId <= 0) return;
  await requireClientAccess(clientId, { edit: true });
  await db
    .update(clients)
    .set({ shareToken: null, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
  revalidatePath(`/clients/${clientId}`);
}

import { sendMail } from "@/lib/mailer";
import { getSetting } from "@/lib/settings-store";

export type EmailPortalResult =
  | { ok: true }
  | { ok: false; error: string };

export async function emailPortalLink(input: {
  clientId: number;
  recipientEmail?: string;
  baseUrl: string;
}): Promise<EmailPortalResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_share-actions");
  if (!Number.isFinite(input.clientId) || input.clientId <= 0) {
    return { ok: false, error: tx("invalidClient") };
  }
  await requireClientAccess(input.clientId, { edit: true });
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) return { ok: false, error: tx("clientNotFound") };
  if (!client.shareToken) {
    return {
      ok: false,
      error: tx("generateAShareLinkFirst"),
    };
  }
  const recipient =
    input.recipientEmail?.trim() || client.email?.trim() || "";
  if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
    return {
      ok: false,
      error:
        tx("needARecipientEmailSet"),
    };
  }

  const brandName = (await getSetting<string>("brand.name")) ?? tx("yourSeoTeam");
  const portalUrl = `${input.baseUrl.replace(/\/$/, "")}/portal/${client.shareToken}`;

  const subject = tx("yourSeoProgressLiveLink", { name: client.name });
  const hello = tx("inviteHello");
  const intro = tx("inviteIntro", { name: client.name });
  const what = tx("inviteWhat");
  const bookmark = tx("inviteBookmark");
  const text = [hello, "", intro, "", portalUrl, "", what, "", bookmark, "", `— ${brandName}`].join("\n");

  const html = `<p>${escapeHtml(hello)}</p>
<p>${escapeHtml(intro)}</p>
<p><a href="${escapeAttr(portalUrl)}">${escapeHtml(portalUrl)}</a></p>
<p>${escapeHtml(what)}</p>
<p>${escapeHtml(bookmark)}</p>
<p>&mdash; ${escapeHtml(brandName)}</p>`;

  const sendResult = await sendMail({
    to: [recipient],
    subject,
    text,
    html,
  });
  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error };
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
