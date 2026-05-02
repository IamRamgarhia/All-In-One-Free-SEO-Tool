"use client";

import { useActionState, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveSchedule,
  deleteSchedule,
  sendReportNow,
  type SaveScheduleResult,
} from "./schedule-actions";

type ScheduleSnapshot = {
  id: number;
  template: "executive" | "detailed" | "technical";
  frequency: "weekly" | "monthly";
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  hourOfDay: number;
  recipients: string[];
  enabled: boolean;
  lastSentAt: Date | null;
  nextSendAt: Date | null;
};

const dowLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ReportScheduleCard({
  clientId,
  smtpConfigured,
  schedule,
}: {
  clientId: number;
  smtpConfigured: boolean;
  schedule: ScheduleSnapshot | null;
}) {
  const [state, formAction, pending] = useActionState<
    SaveScheduleResult | null,
    FormData
  >(saveSchedule, null);

  const [recipients, setRecipients] = useState(
    schedule?.recipients.join(", ") ?? "",
  );
  const [template, setTemplate] = useState(schedule?.template ?? "detailed");
  const [frequency, setFrequency] = useState(schedule?.frequency ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(
    String(schedule?.dayOfMonth ?? 1),
  );
  const [dayOfWeek, setDayOfWeek] = useState(
    String(schedule?.dayOfWeek ?? 1),
  );
  const [hourOfDay, setHourOfDay] = useState(
    String(schedule?.hourOfDay ?? 9),
  );

  const [sendNowPending, startSendNow] = useTransition();
  const [sendNowMsg, setSendNowMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function runSendNow() {
    setSendNowMsg(null);
    startSendNow(async () => {
      const r = await sendReportNow({
        clientId,
        template,
        recipients,
      });
      setSendNowMsg(
        r.ok
          ? { tone: "success", text: "Report emailed." }
          : { tone: "error", text: r.error ?? "Failed" },
      );
    });
  }

  return (
    <div className="space-y-4">
      {!smtpConfigured && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="flex-1 space-y-0.5">
            <div className="font-medium text-amber-200">
              SMTP not configured
            </div>
            <p className="text-xs text-muted-foreground">
              Set up email delivery in{" "}
              <a
                href="/settings"
                className="text-amber-200 underline-offset-2 hover:underline"
              >
                Settings → Email delivery
              </a>{" "}
              before scheduling reports.
            </p>
          </div>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="clientId" value={clientId} />

        <div className="space-y-1.5">
          <Label htmlFor="recipients">Recipients</Label>
          <textarea
            id="recipients"
            name="recipients"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            rows={2}
            placeholder="client@example.com, team@example.com"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-[15px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground/80">
            Comma, semicolon, or newline-separated. Invalid addresses are
            silently dropped.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="template">Template</Label>
            <select
              id="template"
              name="template"
              value={template}
              onChange={(e) =>
                setTemplate(e.target.value as ScheduleSnapshot["template"])
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="detailed">Detailed (recommended)</option>
              <option value="executive">Executive (1 page)</option>
              <option value="technical">Technical</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="frequency">Frequency</Label>
            <select
              id="frequency"
              name="frequency"
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as ScheduleSnapshot["frequency"])
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {frequency === "monthly" ? (
            <div className="space-y-1.5">
              <Label htmlFor="dayOfMonth">Day of month</Label>
              <select
                id="dayOfMonth"
                name="dayOfMonth"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground/80">
                Capped at 28 to handle short months consistently.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="dayOfWeek">Day of week</Label>
              <select
                id="dayOfWeek"
                name="dayOfWeek"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {dowLabels.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="hourOfDay">Hour of day</Label>
            <Input
              id="hourOfDay"
              name="hourOfDay"
              type="number"
              min={0}
              max={23}
              value={hourOfDay}
              onChange={(e) => setHourOfDay(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground/80">
              Local time (0-23). 9 = 9 AM.
            </p>
          </div>
        </div>

        {state && !state.ok && (
          <div className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/30">
            {state.error}
          </div>
        )}
        {state?.ok && (
          <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-500/30">
            Schedule saved. Next send:{" "}
            {schedule?.nextSendAt?.toLocaleString() ?? "computed."}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            <CalendarClock className="size-3.5" />
            {pending ? "Saving…" : schedule ? "Update schedule" : "Save schedule"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runSendNow}
            disabled={sendNowPending || !smtpConfigured || !recipients.trim()}
          >
            {sendNowPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                Send now
              </>
            )}
          </Button>
          {schedule && (
            <form
              action={async () => {
                await deleteSchedule(schedule.id, clientId);
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </form>
          )}
        </div>
      </form>

      {sendNowMsg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            sendNowMsg.tone === "success"
              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30"
          }`}
        >
          {sendNowMsg.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{sendNowMsg.text}</span>
        </div>
      )}

      {schedule && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Mail className="size-3.5 text-violet-300" />
            Active schedule
          </div>
          <div className="mt-1.5 space-y-0.5 text-muted-foreground">
            <div>
              <strong className="text-foreground">{schedule.template}</strong>{" "}
              report ·{" "}
              <strong className="text-foreground">
                {schedule.frequency === "monthly"
                  ? `monthly on day ${schedule.dayOfMonth}`
                  : `weekly on ${dowLabels[schedule.dayOfWeek ?? 1]}`}
              </strong>{" "}
              at {schedule.hourOfDay}:00
            </div>
            <div>
              {schedule.recipients.length} recipient
              {schedule.recipients.length === 1 ? "" : "s"}:{" "}
              {schedule.recipients.join(", ")}
            </div>
            {schedule.lastSentAt && (
              <div>Last sent: {schedule.lastSentAt.toLocaleString()}</div>
            )}
            {schedule.nextSendAt && (
              <div>Next send: {schedule.nextSendAt.toLocaleString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
