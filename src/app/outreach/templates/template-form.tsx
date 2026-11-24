"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { saveOutreachTemplate, type SaveTemplateResult } from "../actions";

export function TemplateForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const tx = useTranslations("ui.app_outreach_templates_template-form");
  const [state, formAction, pending] = useActionState<
    SaveTemplateResult | null,
    FormData
  >(saveOutreachTemplate, null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
      <h2 className="text-base font-semibold">{tx("newTemplate")}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {tx("savedTemplatesAreAvailableWhen")}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tx("name")}</span>
            <input
              name="name"
              required
              maxLength={120}
              placeholder={tx("guestPostPitch")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">
              {tx("clientOptionalLeaveBlankFor")}
            </span>
            <select
              name="clientId"
              defaultValue=""
              className="flex h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            >
              <option value="">{tx("workspaceWide")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{tx("subject")}</span>
          <input
            name="subject"
            required
            maxLength={300}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={tx("subjectPlaceholder", { website: "{{website}}" })}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{tx("body")}</span>
          <textarea
            name="body"
            required
            maxLength={20000}
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tx("bodyPlaceholder", { name: "{{name}}", website: "{{website}}" })}
            className="w-full rounded-md border border-white/10 bg-card/60 px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {tx.rich("variablesTip", {
              variable: "{{name}}",
              code: (chunks) => <code>{chunks}</code>,
            })}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md bg-violet-500/15 px-4 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {pending ? tx("saving") : tx("saveTemplate")}
          </button>
        </div>

        {state && !state.ok && (
          <p className="text-xs text-rose-300">{state.error}</p>
        )}
        {state && state.ok && (
          <p className="text-xs text-emerald-300">{tx("saved")}</p>
        )}
      </form>
    </section>
  );
}
