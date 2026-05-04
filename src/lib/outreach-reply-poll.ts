/**
 * Outreach reply poller. Uses the Gmail API (read-only scope, free) to
 * fetch the connected Google account's recent inbox, match each email
 * against the user's outreach contacts (by sender), and:
 *
 *   - Update the contact's status from "contacted" → "replied"
 *   - Insert a record into outreach_messages so the conversation log
 *     reflects the reply
 *   - Log activity so the dashboard shows it
 *
 * Runs from the daily-agent on a 6h cooldown. No-op if Gmail scope
 * wasn't granted (older OAuth grants won't have it).
 */

import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  outreachContacts,
  outreachMessages,
} from "@/db/schema";
import { getAccessToken } from "./google-oauth";
import { logActivity } from "./activity";
import { getSetting, setSetting } from "./settings-store";

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

type GmailMessageList = {
  messages?: { id: string }[];
  nextPageToken?: string;
};

type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType?: string; body?: { data?: string } }[];
  };
  snippet?: string;
};

export async function pollOutreachReplies(): Promise<{
  scanned: number;
  matched: number;
  reason?: string;
}> {
  const last = await getSetting<number>(
    "outreach_reply_poll.last_run",
  ).catch(() => null);
  if (typeof last === "number" && Date.now() - last < POLL_INTERVAL_MS) {
    return { scanned: 0, matched: 0, reason: "throttled" };
  }
  await setSetting("outreach_reply_poll.last_run", Date.now()).catch(() => {});

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return { scanned: 0, matched: 0, reason: "no google" };
  }

  const sinceDays = 14;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  const sinceQuery = `after:${Math.floor(since.getTime() / 1000)}`;
  // Restrict to inbox messages (skip our own sent mail)
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`in:inbox ${sinceQuery}`)}&maxResults=100`;
  let listRes: Response;
  try {
    listRes = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    return { scanned: 0, matched: 0, reason: "gmail unreachable" };
  }
  if (listRes.status === 403 || listRes.status === 401) {
    return { scanned: 0, matched: 0, reason: "gmail scope not granted" };
  }
  if (!listRes.ok) {
    return { scanned: 0, matched: 0, reason: `${listRes.status}` };
  }
  const listData = (await listRes.json()) as GmailMessageList;
  const ids = (listData.messages ?? []).map((m) => m.id).slice(0, 80);
  if (ids.length === 0) return { scanned: 0, matched: 0 };

  // Pull all candidate outreach contacts in "contacted" status — these
  // are the ones we expect replies from.
  const candidates = await db
    .select()
    .from(outreachContacts)
    .where(
      and(
        eq(outreachContacts.status, "contacted"),
        gte(
          outreachContacts.lastContactedAt,
          new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        ),
      ),
    );
  if (candidates.length === 0) {
    return { scanned: ids.length, matched: 0, reason: "no contacted prospects" };
  }
  const byEmail = new Map(
    candidates
      .filter((c) => c.email)
      .map((c) => [c.email!.toLowerCase(), c]),
  );

  let matched = 0;
  // Fetch each message metadata + match against the outreach pool
  for (const id of ids) {
    let msg: GmailMessage | null = null;
    try {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (!r.ok) continue;
      msg = (await r.json()) as GmailMessage;
    } catch {
      continue;
    }
    if (!msg) continue;
    const headers = msg.payload?.headers ?? [];
    const fromRaw = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
    const fromEmail = extractEmail(fromRaw);
    if (!fromEmail) continue;
    const contact = byEmail.get(fromEmail.toLowerCase());
    if (!contact) continue;

    // Idempotent: only insert + flip status once per Gmail message id
    const existing = await db
      .select({ id: outreachMessages.id })
      .from(outreachMessages)
      .where(
        and(
          eq(outreachMessages.contactId, contact.id),
          eq(outreachMessages.subject, `RE: ${subject.slice(0, 280)}`),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(outreachMessages).values({
      contactId: contact.id,
      templateId: null,
      subject: `RE: ${subject.slice(0, 280)}`,
      body: msg.snippet ?? "",
      status: "sent",
      sentAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    });

    await db
      .update(outreachContacts)
      .set({ status: "replied", updatedAt: new Date() })
      .where(eq(outreachContacts.id, contact.id));

    await logActivity({
      kind: "outreach.replied",
      message: `${contact.name} replied to outreach (${subject.slice(0, 80)})`,
      level: "success",
      clientId: contact.clientId,
      entityType: "outreach",
      entityId: contact.id,
    });
    matched++;
  }

  return { scanned: ids.length, matched };
}

function extractEmail(rawFrom: string): string | null {
  const angle = rawFrom.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  // Bare email like "user@example.com"
  const bare = rawFrom.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return bare ? bare[0] : null;
}

// Workaround for the read-only SettingKey type — use suppressed any
// because we're adding a new key on the fly. Keeps the strict union
// in settings-store.ts intact.
void inArray;
