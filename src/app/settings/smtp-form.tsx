"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, AlertCircle, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveSmtpConfig,
  testSmtpConnection,
  sendTestEmail,
  clearSmtpConfig,
  type SaveSmtpResult,
} from "./smtp-actions";

type Initial = {
  host: string | null;
  port: string | null;
  user: string | null;
  fromEmail: string | null;
  fromName: string | null;
  secure: string | null;
  hasPassword: boolean;
};

export function SmtpForm({ initial }: { initial: Initial }) {
  const [state, formAction, pending] = useActionState<
    SaveSmtpResult | null,
    FormData
  >(saveSmtpConfig, null);
  const errors = state && !state.ok ? state.errors : {};

  const [testTo, setTestTo] = useState("");
  const [testPending, startTest] = useTransition();
  const [testMsg, setTestMsg] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function runVerify() {
    setTestMsg(null);
    startTest(async () => {
      const r = await testSmtpConnection();
      setTestMsg(
        r.ok
          ? { tone: "success", text: "SMTP connection verified." }
          : { tone: "error", text: r.error ?? "Failed" },
      );
    });
  }

  function runSend() {
    if (!testTo.trim()) {
      setTestMsg({ tone: "error", text: "Enter an email to send to." });
      return;
    }
    setTestMsg(null);
    startTest(async () => {
      const r = await sendTestEmail(testTo.trim());
      setTestMsg(
        r.ok
          ? { tone: "success", text: `Test email sent to ${testTo}.` }
          : { tone: "error", text: r.error ?? "Failed" },
      );
    });
  }

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="SMTP host"
            name="host"
            defaultValue={initial.host ?? ""}
            placeholder="smtp.gmail.com"
            error={errors.host}
            required
          />
          <Field
            label="Port"
            name="port"
            type="number"
            defaultValue={initial.port ?? "587"}
            placeholder="587"
            error={errors.port}
            required
          />
          <Field
            label="Username"
            name="user"
            defaultValue={initial.user ?? ""}
            placeholder="you@gmail.com"
            error={errors.user}
          />
          <Field
            label="Password / App password"
            name="password"
            type="password"
            placeholder={initial.hasPassword ? "•••••••••• (saved)" : ""}
            error={errors.password}
          />
          <Field
            label="From email"
            name="fromEmail"
            type="email"
            defaultValue={initial.fromEmail ?? ""}
            placeholder="reports@yourdomain.com"
            error={errors.fromEmail}
            required
          />
          <Field
            label="From name (optional)"
            name="fromName"
            defaultValue={initial.fromName ?? ""}
            placeholder="Acme SEO"
            error={errors.fromName}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="secure"
            name="secure"
            value="true"
            defaultChecked={initial.secure === "true"}
            className="size-4 cursor-pointer accent-violet-500"
          />
          <Label htmlFor="secure" className="cursor-pointer">
            Use TLS/SSL (port 465). Leave off for STARTTLS on 587.
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save SMTP config"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={runVerify}
            disabled={testPending}
          >
            <CheckCircle2 className="size-3.5" />
            Test connection
          </Button>
          {(initial.host || initial.fromEmail) && (
            <form action={clearSmtpConfig}>
              <Button type="submit" variant="ghost" size="sm">
                Clear all
              </Button>
            </form>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="testTo">Send a test email</Label>
            <Input
              id="testTo"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={runSend}
            disabled={testPending || !testTo.trim()}
          >
            <Send className="size-3.5" />
            Send test
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Sends a one-line plain-text email so you can confirm before scheduling
          real reports.
        </p>
      </div>

      {testMsg && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            testMsg.tone === "success"
              ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30"
          }`}
        >
          {testMsg.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>{testMsg.text}</span>
        </div>
      )}

      <Examples />
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        aria-invalid={Boolean(error)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Examples() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Mail className="size-3.5 text-violet-300" />
        Common provider settings
      </div>
      <div className="mt-2 grid gap-3 text-muted-foreground sm:grid-cols-3">
        <div>
          <div className="font-medium text-foreground">Gmail</div>
          <div className="font-mono text-[11px]">
            smtp.gmail.com · 587 · STARTTLS
          </div>
          <div className="mt-1 text-[11px]">
            Use an{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-violet-300 hover:underline"
            >
              App Password
            </a>
            , not your real password.
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground">Resend</div>
          <div className="font-mono text-[11px]">
            smtp.resend.com · 465 · TLS
          </div>
          <div className="mt-1 text-[11px]">
            Username: <code>resend</code> · Password: API key.
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground">SendGrid</div>
          <div className="font-mono text-[11px]">
            smtp.sendgrid.net · 587 · STARTTLS
          </div>
          <div className="mt-1 text-[11px]">
            Username: <code>apikey</code> · Password: API key.
          </div>
        </div>
      </div>
    </div>
  );
}
