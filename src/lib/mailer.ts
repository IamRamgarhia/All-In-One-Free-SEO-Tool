import nodemailer, { type Transporter } from "nodemailer";
import { getSetting } from "./settings-store";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string | null;
  secure: boolean;
};

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [host, portRaw, user, password, fromEmail, fromName, secureRaw] =
    await Promise.all([
      getSetting<string>("smtp.host"),
      getSetting<string>("smtp.port"),
      getSetting<string>("smtp.user"),
      getSetting<string>("smtp.password"),
      getSetting<string>("smtp.from_email"),
      getSetting<string>("smtp.from_name"),
      getSetting<string>("smtp.secure"),
    ]);
  if (!host || !portRaw || !fromEmail) return null;
  const port = Number(portRaw);
  if (!Number.isFinite(port)) return null;
  return {
    host,
    port,
    user: user ?? "",
    password: password ?? "",
    fromEmail,
    fromName: fromName ?? null,
    secure: secureRaw === "true" || port === 465,
  };
}

let cachedTransporter: Transporter | null = null;
let cachedConfigKey: string | null = null;

function configKey(c: SmtpConfig) {
  return `${c.host}:${c.port}:${c.user}:${c.secure}`;
}

export async function getTransporter(): Promise<Transporter | null> {
  const cfg = await getSmtpConfig();
  if (!cfg) return null;
  const key = configKey(cfg);
  if (cachedTransporter && cachedConfigKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password } : undefined,
  });
  cachedConfigKey = key;
  return cachedTransporter;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendMail(opts: {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<SendResult> {
  const cfg = await getSmtpConfig();
  if (!cfg) return { ok: false, error: "SMTP not configured" };
  const transporter = await getTransporter();
  if (!transporter) return { ok: false, error: "SMTP transporter unavailable" };

  try {
    const info = await transporter.sendMail({
      from: cfg.fromName
        ? `"${cfg.fromName}" <${cfg.fromEmail}>`
        : cfg.fromEmail,
      to: opts.to.join(", "),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Verifies the SMTP connection without sending anything. Used by the
 * "Test connection" button in settings.
 */
export async function verifySmtp(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const transporter = await getTransporter();
  if (!transporter) return { ok: false, error: "SMTP not configured" };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
