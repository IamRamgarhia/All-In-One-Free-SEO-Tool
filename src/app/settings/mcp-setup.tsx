"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

/**
 * Per-client setup instructions for connecting a chat app to this tool.
 *
 * Split by client because the answer genuinely differs, and the
 * difference is the thing people get stuck on: Claude Desktop, Claude
 * Code and Cursor run on this machine and can reach localhost, so they
 * work with no tunnel at all. claude.ai and ChatGPT run on their own
 * servers and call you, so they cannot reach localhost under any
 * configuration and need a public HTTPS address.
 *
 * Every command is rendered with the real port, the real install path
 * and the real token already in it. The previous version printed
 * "<path to this folder>" and left the reader to work it out.
 */

type ClientId = "claude-code" | "claude-desktop" | "cursor" | "web";

const TABS: { id: ClientId; label: string; local: boolean }[] = [
  { id: "claude-code", label: "Claude Code", local: true },
  { id: "claude-desktop", label: "Claude Desktop", local: true },
  { id: "cursor", label: "Cursor", local: true },
  { id: "web", label: "claude.ai / ChatGPT", local: false },
];

function Block({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 pr-20 text-[11px] leading-relaxed text-foreground">
        <code>{text}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          });
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] shadow-sm hover:border-foreground/25"
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((node, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-[10px] font-semibold text-violet-300 ring-1 ring-inset ring-violet-500/30">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5 text-xs leading-relaxed">
            {node}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DocLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-violet-300 underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function McpSetup({
  token,
  origin,
  installPath,
}: {
  token: string | null;
  origin: string;
  installPath: string;
}) {
  const [tab, setTab] = useState<ClientId>("claude-code");
  const url = `${origin}/api/mcp`;
  const tok = token ?? "<generate a token above first>";

  // Windows paths contain backslashes, which are escapes inside a JSON
  // string. Emitting the raw path produced a config file the client
  // refused to parse.
  const jsonPath = JSON.stringify(installPath);

  const desktopConfig = `{
  "mcpServers": {
    "seo-tool": {
      "command": "npx",
      "args": ["tsx", "scripts/mcp-server.ts"],
      "cwd": ${jsonPath}
    }
  }
}`;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
      <div>
        <p className="text-xs font-medium">Connect your chat app</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          The first three run on this computer and work right now. The last
          one runs on someone else&apos;s and needs one extra step.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
              tab === t.id
                ? "bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
            }`}
          >
            {t.label}
            {t.local && (
              <span className="ml-1.5 text-[9px] uppercase text-emerald-400/70">
                no setup
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "claude-code" && (
        <Steps
          items={[
            <>
              <p>Run this in a terminal:</p>
              <Block
                text={`claude mcp add -t http seo-tool ${url} -H "Authorization: Bearer ${tok}"`}
              />
            </>,
            <>
              <p>
                Type <code className="rounded bg-muted px-1">/mcp</code> inside
                Claude Code to confirm it connected.
              </p>
            </>,
            <>
              <p>
                <DocLink href="https://code.claude.com/docs/en/mcp">
                  Claude Code MCP documentation
                </DocLink>
              </p>
            </>,
          ]}
        />
      )}

      {(tab === "claude-desktop" || tab === "cursor") && (
        <Steps
          items={[
            <>
              <p>
                {tab === "claude-desktop"
                  ? "Open Settings → Developer → Edit Config."
                  : "Open Settings → MCP → Add new global MCP server."}
              </p>
            </>,
            <>
              <p>Paste this, then save:</p>
              <Block text={desktopConfig} />
              <p className="text-muted-foreground">
                Uses stdio, not the URL above — it launches the server as a
                child process, so nothing is exposed on the network.
              </p>
            </>,
            <>
              <p>
                Restart {tab === "claude-desktop" ? "Claude Desktop" : "Cursor"}
                . MCP servers are only read at startup.
              </p>
            </>,
            <>
              <p>
                {tab === "claude-desktop" ? (
                  <DocLink href="https://modelcontextprotocol.io/quickstart/user">
                    Claude Desktop MCP quickstart
                  </DocLink>
                ) : (
                  <DocLink href="https://docs.cursor.com/context/model-context-protocol">
                    Cursor MCP documentation
                  </DocLink>
                )}
              </p>
            </>,
          ]}
        />
      )}

      {tab === "web" && (
        <div className="space-y-2.5">
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-relaxed text-amber-900 dark:text-amber-100/90">
            <strong>Why this one is different.</strong> claude.ai and ChatGPT
            run on their own servers and call <em>your</em> server — Anthropic
            from <code>160.79.104.0/21</code>. They cannot reach{" "}
            <code>localhost</code>, and both refuse a URL that isn&apos;t
            HTTPS. So this needs a public address, which the three tabs above
            do not.
          </p>
          <Steps
            items={[
              <>
                <p>
                  Install cloudflared —{" "}
                  <DocLink href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/">
                    download page
                  </DocLink>
                  . Free, and no account needed for a quick tunnel.
                </p>
              </>,
              <>
                <p>Run this and leave it running:</p>
                <Block text={`cloudflared tunnel --url ${origin}`} />
                <p className="text-muted-foreground">
                  It prints an https://….trycloudflare.com address.
                </p>
              </>,
              <>
                <p>
                  In claude.ai go to Settings → Connectors → Add custom
                  connector, and paste that address with{" "}
                  <code className="rounded bg-muted px-1">/api/mcp</code> on the
                  end.
                </p>
              </>,
              <>
                <p>
                  Give it the token as an{" "}
                  <code className="rounded bg-muted px-1">Authorization</code>{" "}
                  header —{" "}
                  <DocLink href="https://claude.com/docs/connectors/custom/remote-mcp">
                    request-header authentication
                  </DocLink>{" "}
                  (currently in beta, and set by an organisation admin).
                </p>
              </>,
            ]}
          />
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] leading-relaxed text-rose-900 dark:text-rose-100/90">
            <strong>Worth knowing before you do this.</strong> A tunnel puts an
            endpoint that can read every client and change live websites on the
            public internet, with only that token in front of it. Stop the
            tunnel when you are not using it, and revoke the token if it ever
            leaks.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Anthropic also has an official{" "}
            <DocLink href="https://platform.claude.com/docs/en/agents-and-tools/mcp-tunnels/quickstart">
              MCP tunnels
            </DocLink>{" "}
            preview — outbound-only, so nothing is exposed inbound. Needs Docker
            and a Claude Console role.
          </p>
        </div>
      )}
    </div>
  );
}
