import { db } from "@/db/client";
import {
  clients,
  outreachContacts,
  outreachMessages,
  outreachTemplates,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "./mailer";
import { logActivity } from "./activity";

/**
 * Returns the variables a template body / subject is allowed to reference.
 * Currently: contact + linked-client fields. Keeps the surface small so
 * users don't end up writing free-form code injection paths.
 */
export const TEMPLATE_VARIABLES = [
  "name",
  "email",
  "website",
  "client_name",
  "client_url",
  "my_name",
] as const;

export type TemplateVar = (typeof TEMPLATE_VARIABLES)[number];

export function extractVariables(...sources: string[]): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([a-z_]+)\s*\}\}/gi;
  for (const src of sources) {
    for (const m of src.matchAll(re)) {
      found.add(m[1].toLowerCase());
    }
  }
  return Array.from(found);
}

export function renderTemplate(
  src: string,
  vars: Record<string, string | null | undefined>,
): string {
  return src.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => {
    const v = vars[key.toLowerCase()];
    return v == null ? "" : String(v);
  });
}

export type SendOutreachResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string };

/**
 * Renders the template (or raw subject/body) against a contact's data and
 * sends via the configured SMTP transport. Logs both success and failure
 * into outreach_messages for the per-contact history view.
 */
export async function sendOutreachEmail(opts: {
  contactId: number;
  /** When provided, pulls subject/body from a saved template. */
  templateId?: number | null;
  /** Direct subject (overrides template). */
  subject?: string;
  /** Direct body (overrides template). */
  body?: string;
  /** Optional sender display name interpolated as {{my_name}}. */
  myName?: string;
}): Promise<SendOutreachResult> {
  const [contact] = await db
    .select()
    .from(outreachContacts)
    .where(eq(outreachContacts.id, opts.contactId))
    .limit(1);
  if (!contact) return { ok: false, error: "Contact not found" };
  if (!contact.email)
    return { ok: false, error: "Contact has no email address" };

  let subject = opts.subject ?? "";
  let body = opts.body ?? "";

  if (opts.templateId) {
    const [tpl] = await db
      .select()
      .from(outreachTemplates)
      .where(eq(outreachTemplates.id, opts.templateId))
      .limit(1);
    if (!tpl) return { ok: false, error: "Template not found" };
    if (!subject) subject = tpl.subject;
    if (!body) body = tpl.body;
  }

  if (!subject || !body) {
    return { ok: false, error: "Subject and body are required" };
  }

  const [client] = await db
    .select({ name: clients.name, url: clients.url })
    .from(clients)
    .where(eq(clients.id, contact.clientId))
    .limit(1);

  const vars: Record<string, string> = {
    name: contact.name,
    email: contact.email ?? "",
    website: contact.website ?? "",
    client_name: client?.name ?? "",
    client_url: client?.url ?? "",
    my_name: opts.myName ?? "",
  };

  const renderedSubject = renderTemplate(subject, vars);
  const renderedBody = renderTemplate(body, vars);

  const result = await sendMail({
    to: [contact.email],
    subject: renderedSubject,
    text: renderedBody,
    html: textToHtml(renderedBody),
  });

  if (!result.ok) {
    await db.insert(outreachMessages).values({
      contactId: contact.id,
      templateId: opts.templateId ?? null,
      subject: renderedSubject,
      body: renderedBody,
      status: "failed",
      error: result.error,
    });
    return { ok: false, error: result.error };
  }

  const [row] = await db
    .insert(outreachMessages)
    .values({
      contactId: contact.id,
      templateId: opts.templateId ?? null,
      subject: renderedSubject,
      body: renderedBody,
      status: "sent",
    })
    .returning({ id: outreachMessages.id });

  // Auto-promote prospect → contacted on first successful send
  if (contact.status === "prospect") {
    await db
      .update(outreachContacts)
      .set({
        status: "contacted",
        lastContactedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(outreachContacts.id, contact.id));
  } else {
    await db
      .update(outreachContacts)
      .set({ lastContactedAt: new Date(), updatedAt: new Date() })
      .where(eq(outreachContacts.id, contact.id));
  }

  await logActivity({
    kind: "outreach.sent",
    message: `Outreach email sent to ${contact.name}`,
    messageFr: `E-mail de prospection envoyé à ${contact.name}`,
    clientId: contact.clientId,
    entityType: "outreach",
    entityId: contact.id,
    level: "success",
  });

  return { ok: true, messageId: row.id };
}

function textToHtml(text: string): string {
  // Conservative: escape, preserve paragraph breaks, linkify bare URLs
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const linkify = (s: string) =>
    s.replace(
      /(https?:\/\/[^\s<]+[^\s<.,;:!?\)])/g,
      '<a href="$1">$1</a>',
    );
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p>${linkify(esc(p)).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">${paragraphs}</div>`;
}

/**
 * Default templates seeded the first time a workspace opens the outreach
 * inbox. Users can edit, copy, or delete; we never re-seed once any row
 * exists in the table.
 */
export const DEFAULT_TEMPLATES: { name: string; subject: string; body: string }[] =
  [
    {
      name: "Guest post pitch",
      subject: "Guest post idea for {{client_name}} readers",
      body: `Hi {{name}},

I came across {{website}} and loved your recent posts. I run content for {{client_name}} ({{client_url}}) and have a few angle ideas your audience would find useful — happy to draft a free guest post tailored to your style.

Three working titles I had in mind:
- [angle 1]
- [angle 2]
- [angle 3]

If any of those click, I can have a draft in your inbox by next week.

Thanks,
{{my_name}}`,
    },
    {
      name: "Broken link replacement",
      subject: "Quick heads-up: broken link on {{website}}",
      body: `Hi {{name}},

Quick note — I was reading your post on {{website}} and noticed one of the outbound links no longer resolves.

We have a free resource on the same topic at {{client_url}} — completely fine if it's not a fit, but figured I'd mention it in case it saves someone a click.

Either way, hope it helps.

— {{my_name}}`,
    },
    {
      name: "Resource page outreach",
      subject: "Suggestion for your {{website}} resource list",
      body: `Hi {{name}},

I really like the resource list on {{website}} — genuinely useful curation.

We just published a free tool / guide at {{client_url}} that might fit alongside the rest. Zero pressure, only mentioning it because the other entries on your list are exactly the kind of thing it complements.

Thanks for putting that page together.

{{my_name}}`,
    },
    {
      name: "Backlink recovery",
      subject: "Lost link on {{website}} — easy fix?",
      body: `Hi {{name}},

A while back you linked to {{client_name}} ({{client_url}}) — really appreciated it.

Looks like the link may have dropped during a recent update of the page on {{website}}. If you're up for restoring it, the original URL still works.

Either way, thanks for the support.

{{my_name}}`,
    },
  ];
