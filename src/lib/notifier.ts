import { getSetting } from "./settings-store";

type WebhookKind = "slack" | "discord" | "teams" | "generic";

export type NotificationField = { label: string; value: string };

export type NotificationInput = {
  title: string;
  body: string;
  level?: "info" | "success" | "warning" | "error";
  fields?: NotificationField[];
  link?: { label: string; url: string };
};

export type NotifyResult =
  | { ok: true; status: number; kind: WebhookKind }
  | { ok: false; error: string };

const colorByLevel: Record<NonNullable<NotificationInput["level"]>, number> = {
  info: 0x6d49d6, // violet
  success: 0x16a34a, // emerald
  warning: 0xd97706, // amber
  error: 0xc43151, // rose
};

const slackColorByLevel: Record<
  NonNullable<NotificationInput["level"]>,
  string
> = {
  info: "#6d49d6",
  success: "#16a34a",
  warning: "#d97706",
  error: "#c43151",
};

const emojiByLevel: Record<NonNullable<NotificationInput["level"]>, string> = {
  info: "🔍",
  success: "✅",
  warning: "⚠️",
  error: "❌",
};

export function detectKind(url: string): WebhookKind {
  if (/hooks\.slack\.com/i.test(url)) return "slack";
  if (/discord(?:app)?\.com\/api\/webhooks/i.test(url)) return "discord";
  if (/(?:office\.com|outlook\.com|webhook\.office\.com|teams\.microsoft\.com)/i.test(url))
    return "teams";
  return "generic";
}

function buildSlackPayload(input: NotificationInput) {
  const color = slackColorByLevel[input.level ?? "info"];
  const fields =
    input.fields?.map((f) => ({
      title: f.label,
      value: f.value,
      short: true,
    })) ?? [];

  const attachment: Record<string, unknown> = {
    color,
    title: input.title,
    text: input.body,
    fields,
    mrkdwn_in: ["text"],
    footer: "SEO tool",
    ts: Math.floor(Date.now() / 1000),
  };

  if (input.link) {
    attachment.actions = [
      {
        type: "button",
        text: input.link.label,
        url: input.link.url,
      },
    ];
  }

  return { attachments: [attachment] };
}

function buildDiscordPayload(input: NotificationInput) {
  const color = colorByLevel[input.level ?? "info"];
  const fields =
    input.fields?.map((f) => ({
      name: f.label,
      value: f.value,
      inline: true,
    })) ?? [];

  return {
    embeds: [
      {
        title: input.title,
        description: input.body,
        color,
        fields,
        footer: { text: "SEO tool" },
        timestamp: new Date().toISOString(),
        url: input.link?.url,
      },
    ],
    username: "SEO tool",
  };
}

function buildTeamsPayload(input: NotificationInput) {
  const themeColor = colorByLevel[input.level ?? "info"]
    .toString(16)
    .padStart(6, "0")
    .toUpperCase();
  const facts =
    input.fields?.map((f) => ({ name: f.label, value: f.value })) ?? [];

  const card: Record<string, unknown> = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor,
    summary: input.title,
    title: input.title,
    text: input.body,
    sections: facts.length > 0 ? [{ facts }] : undefined,
  };

  if (input.link) {
    card.potentialAction = [
      {
        "@type": "OpenUri",
        name: input.link.label,
        targets: [{ os: "default", uri: input.link.url }],
      },
    ];
  }

  return card;
}

function buildGenericPayload(input: NotificationInput) {
  return {
    source: "seo-tool",
    level: input.level ?? "info",
    emoji: emojiByLevel[input.level ?? "info"],
    title: input.title,
    body: input.body,
    fields: input.fields ?? [],
    link: input.link,
    timestamp: new Date().toISOString(),
  };
}

export async function sendToWebhook(
  url: string,
  input: NotificationInput,
): Promise<NotifyResult> {
  const kind = detectKind(url);
  const payload =
    kind === "slack"
      ? buildSlackPayload(input)
      : kind === "discord"
        ? buildDiscordPayload(input)
        : kind === "teams"
          ? buildTeamsPayload(input)
          : buildGenericPayload(input);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")) || res.statusText;
      return {
        ok: false,
        error: `Webhook returned HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true, status: res.status, kind };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send a notification using the workspace's configured webhook.
 * Silently no-ops if no webhook is set (so callers don't need to check).
 */
export async function notify(input: NotificationInput): Promise<NotifyResult> {
  const url = await getSetting<string>("webhook.url");
  if (!url) {
    return { ok: false, error: "No webhook URL configured" };
  }
  return sendToWebhook(url, input);
}
