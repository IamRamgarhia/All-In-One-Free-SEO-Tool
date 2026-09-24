/**
 * Translates raw error messages into plain-English explanations with
 * actionable next steps. Used by the error boundary and the error-log
 * page so non-technical users see "Your AI key is invalid — generate
 * a new one" instead of `400: { "code": "API_KEY_INVALID" ... }`.
 *
 * Rules are pattern-matched in order; first match wins. If nothing
 * matches we fall through to a generic "unknown error" with the
 * GitHub-issue prefill link so the user can report it.
 */

import { REPO_SLUG } from "./repo";

export type FriendlyError = {
  title: string;
  explanation: string;
  steps: string[];
  /** Where to send the user if our steps don't work. */
  helpLink?: { label: string; href: string };
  /** GitHub issue body, prefilled and ready to paste. */
  githubIssue?: { title: string; body: string };
};

const REPO = REPO_SLUG;

function ghIssueUrl(title: string, body: string): string {
  const u = new URL(`https://github.com/${REPO}/issues/new`);
  u.searchParams.set("title", title);
  u.searchParams.set("body", body);
  return u.toString();
}

type Rule = {
  match: RegExp;
  translate: (raw: string, context?: string) => FriendlyError;
};

const rules: Rule[] = [
  // --- AI / provider errors ----------------------------------------------
  {
    match: /API_KEY_INVALID|API key not valid|invalid_api_key|unauthorized.*api[_ ]?key/i,
    translate: () => ({
      title: "Your AI key is invalid or expired",
      explanation:
        "The API key saved in Settings was rejected by the provider. Most often this means the key was deleted, regenerated, or never copied in full.",
      steps: [
        "Open your provider's dashboard (e.g. https://aistudio.google.com/apikey for Gemini)",
        "Delete the old key and create a fresh one",
        "Paste the new key into Settings → AI providers",
        "Click 'Save', then 'Test' next to the provider",
      ],
      helpLink: { label: "Open AI providers settings", href: "/settings#ai" },
    }),
  },
  {
    match: /quota|rate limit|429|too many requests/i,
    translate: () => ({
      title: "AI provider rate-limited you",
      explanation:
        "You hit the provider's request limit (per minute, per day, or monthly quota). The key still works — just needs to cool down or upgrade.",
      steps: [
        "Wait 1–2 minutes if it's per-minute",
        "Switch to a different provider in Settings → AI providers (Gemini, Groq, OpenRouter all have free tiers)",
        "Or enable Credit Saver mode in Settings to cap tokens and stay under free-tier limits",
      ],
      helpLink: { label: "Open AI providers settings", href: "/settings#ai" },
    }),
  },
  {
    match: /no key saved for|No.*api.*key|provider.*not.*configured/i,
    translate: () => ({
      title: "No AI provider connected",
      explanation:
        "This action needs an AI provider, but none is configured yet. Connect one (free Gemini takes 2 minutes) and try again.",
      steps: [
        "Go to Settings → AI providers",
        "Pick Gemini or Groq (both free)",
        "Follow the in-card instructions to get a key",
        "Paste and Save",
      ],
      helpLink: { label: "Connect an AI provider", href: "/settings#ai" },
    }),
  },
  {
    match: /404.*models\/|model.*not found|generateContent.*404/i,
    translate: () => ({
      title: "AI model name not available for your key",
      explanation:
        "The provider rejected the model we picked. Usually means the model was renamed or your key's region doesn't have access. Our Gemini caller already auto-falls-back, so this only fires when ALL fallbacks failed.",
      steps: [
        "Regenerate your Gemini key — fresh keys get current models",
        "Or switch to a different provider in Settings → AI providers",
        "If this keeps happening with a fresh key, report it (link below)",
      ],
    }),
  },

  // --- Network / connectivity --------------------------------------------
  {
    match: /ECONNREFUSED|connection refused/i,
    translate: () => ({
      title: "Couldn't reach the server",
      explanation:
        "The provider's API isn't responding. Either your machine is offline or the provider is having an outage.",
      steps: [
        "Check your internet connection",
        "Try again in 30 seconds — most outages are short",
        "If only one provider is down, switch to another in Settings",
      ],
    }),
  },
  {
    match: /ETIMEDOUT|timeout|aborted.*signal/i,
    translate: () => ({
      title: "Request timed out",
      explanation:
        "The server took too long to respond. Often happens with slow connections or large requests.",
      steps: [
        "Try again — short timeouts are usually transient",
        "If you're using a local Ollama, make sure the daemon is running",
        "For long-running tasks (large audits), try splitting the work",
      ],
    }),
  },
  {
    match: /ENOTFOUND|getaddrinfo|DNS/i,
    translate: () => ({
      title: "DNS lookup failed",
      explanation:
        "Couldn't resolve the server's address. Usually a network issue, sometimes a corporate firewall.",
      steps: [
        "Check your internet connection",
        "Try opening the provider's website in a browser to confirm DNS works",
        "If you're on a VPN or corporate network, try without it",
      ],
    }),
  },

  // --- Dev / build / dependency errors -----------------------------------
  {
    match: /Module not found.*Can't resolve|Cannot find module/i,
    translate: (raw) => {
      const pkg = raw.match(/['"]([^'"]+)['"]/)?.[1] ?? "unknown package";
      return {
        title: `Missing dependency: ${pkg}`,
        explanation:
          "A new package was added in a recent update but isn't installed in your local node_modules. The in-app Update button normally handles this — when you pull manually you need to run install yourself.",
        steps: [
          "Stop the dev server (Ctrl+C in your terminal)",
          "Run: pnpm install",
          "Restart: pnpm dev",
          "Hard-refresh the browser (Ctrl+Shift+R)",
        ],
        helpLink: { label: "Use the in-app updater next time", href: "/settings" },
      };
    },
  },
  {
    match: /Unexpected token.*<!DOCTYPE|is not valid JSON/i,
    translate: () => ({
      title: "Server returned HTML instead of JSON",
      explanation:
        "Usually means the API route doesn't exist yet — your dev server is still running an older bundle that doesn't have the new endpoint.",
      steps: [
        "Stop the dev server (Ctrl+C)",
        "Run pnpm install (catches new dependencies)",
        "Run pnpm dev to start a fresh server",
        "Hard-refresh the browser (Ctrl+Shift+R)",
      ],
    }),
  },

  // --- Google / OAuth -----------------------------------------------------
  {
    match: /invalid_grant|refresh token.*invalid|google.*token/i,
    translate: () => ({
      title: "Google connection expired",
      explanation:
        "Your Google refresh token was revoked — usually because you signed out of Google somewhere, or the token went unused for 6 months.",
      steps: [
        "Go to Settings → Google integration",
        "Click 'Reconnect Google'",
        "Approve the same permissions again",
      ],
      helpLink: { label: "Reconnect Google", href: "/settings/google" },
    }),
  },

  // --- Database -----------------------------------------------------------
  {
    match: /SQLITE_BUSY|database is locked/i,
    translate: () => ({
      title: "Database busy",
      explanation:
        "Another operation is writing to the database. Usually clears in a second.",
      steps: [
        "Wait 2 seconds and try again",
        "If it keeps happening, restart the server (power button bottom-right)",
      ],
    }),
  },
  {
    match: /no such (table|column)/i,
    translate: () => ({
      title: "Database schema out of date",
      explanation:
        "A migration didn't apply. Your code is on a newer version than your database file.",
      steps: [
        "Stop the dev server",
        "Run: node scripts/migrate.cjs",
        "Restart with pnpm dev",
      ],
    }),
  },
];

export function friendlyError(
  raw: string,
  context?: string,
  stack?: string,
): FriendlyError {
  const found = rules.find((r) => r.match.test(raw));
  if (found) {
    const fe = found.translate(raw, context);
    if (!fe.githubIssue) {
      fe.githubIssue = {
        title: `[Error] ${fe.title}`,
        body: buildIssueBody(raw, context, stack, fe.title),
      };
    }
    return fe;
  }

  // Fallback: we don't recognize this error. Give the user a clear
  // path to report it.
  return {
    title: "Something went wrong",
    explanation:
      "We don't have a one-click fix for this exact error yet. The details below have been logged. Use the 'Report on GitHub' button — your error will be pre-filled so the maintainer can fix it fast.",
    steps: [
      "Try the action again — many errors are transient",
      "If it keeps happening, restart the server (power button bottom-right)",
      "Still broken? Report on GitHub (button below) — takes 10 seconds",
    ],
    githubIssue: {
      title: `[Error] ${raw.slice(0, 80)}`,
      body: buildIssueBody(raw, context, stack, "Unknown error"),
    },
  };
}

function buildIssueBody(
  raw: string,
  context: string | undefined,
  stack: string | undefined,
  title: string,
): string {
  return [
    `**What went wrong**`,
    title,
    "",
    `**Error message**`,
    "```",
    raw.slice(0, 800),
    "```",
    "",
    context ? `**Where**\n${context}\n` : "",
    stack
      ? `**Stack (first 30 lines)**\n\`\`\`\n${stack.split("\n").slice(0, 30).join("\n")}\n\`\`\`\n`
      : "",
    `**My setup**`,
    `- App version: (run \`git rev-parse --short HEAD\` in the repo)`,
    `- OS: (Windows / macOS / Linux + version)`,
    `- Node: (run \`node -v\`)`,
    `- Browser: (Chrome / Edge / Firefox + version)`,
    "",
    `**Anything else?**`,
    `(What you were doing when this happened.)`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function ghIssueLink(fe: FriendlyError): string | null {
  if (!fe.githubIssue) return null;
  return ghIssueUrl(fe.githubIssue.title, fe.githubIssue.body);
}
