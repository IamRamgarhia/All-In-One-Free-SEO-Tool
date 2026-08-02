"use client";

import { useActionState, useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import {
  sendOutreachAction,
  type SendResultState,
} from "./actions";

type Template = {
  id: number;
  name: string;
  subject: string;
  body: string;
};

export function ComposeButton({
  contact,
  templates,
  smtpConfigured,
}: {
  contact: {
    id: number;
    name: string;
    email: string;
    website: string | null;
  };
  templates: Template[];
  smtpConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [state, formAction, pending] = useActionState<
    SendResultState,
    FormData
  >(sendOutreachAction, null);

  useEffect(() => {
    if (state?.ok) {
      // Closes the dialog and clears the form once the send action succeeds — a reaction to an event, not derivable state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      setSubject("");
      setBody("");
      setTemplateId("");
    }
  }, [state]);

  if (!smtpConfigured) {
    return (
      <a
        href="/settings#smtp"
        className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/20"
        title="Configure SMTP in Settings to enable sending"
      >
        Set up SMTP
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25"
      >
        <Mail className="size-3" />
        Send
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 shadow-2xl ring-1 ring-white/10 sm:rounded-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <h3 className="text-lg font-semibold">Send to {contact.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {contact.email}
            </p>

            <form action={formAction} className="mt-5 space-y-3">
              <input type="hidden" name="contactId" value={contact.id} />
              <input
                type="hidden"
                name="templateId"
                value={templateId || ""}
              />

              {templates.length > 0 && (
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">
                    Start from a template (optional)
                  </span>
                  <select
                    value={templateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setTemplateId(id);
                      const t = templates.find((x) => String(x.id) === id);
                      if (t) {
                        setSubject(t.subject);
                        setBody(t.body);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
                  >
                    <option value="">— blank —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Subject</span>
                <input
                  name="subject"
                  required
                  maxLength={300}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>

              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Body</span>
                <textarea
                  name="body"
                  required
                  rows={12}
                  maxLength={20000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <span className="text-[10px] text-muted-foreground">
                  Variables like {"{{name}}"} get replaced before sending.
                  Preview: &quot;
                  {previewSubject(subject, contact)}&quot;
                </span>
              </label>

              {state && !state.ok && (
                <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
                  {state.error}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-emerald-500/15 px-4 py-1.5 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {pending ? "Sending…" : "Send email"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function previewSubject(
  src: string,
  contact: { name: string; website: string | null },
): string {
  return src
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name)
    .replace(/\{\{\s*website\s*\}\}/gi, contact.website ?? "")
    .replace(/\{\{[^}]+\}\}/g, "…");
}
