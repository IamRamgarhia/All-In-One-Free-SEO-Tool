"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openChat } from "@/components/claude/dock-store";
import { LEVEL_LABELS, type AutonomyLevel } from "@/lib/agent/autonomy-levels";
import { runNow, setClientAutopilot } from "./actions";

type Row = {
  id: number;
  name: string;
  level: AutonomyLevel | null;
  engineSetting: "auto" | "wordpress" | "claude";
  engine: "wordpress" | "claude" | "none";
  folder: string | null;
  repo: string | null;
  prMode: "off" | "pr" | "pr_merge" | "pr_batch";
};

const LEVELS: AutonomyLevel[] = ["off", "suggest", "apply_safe", "apply_all"];

const ENGINE_LABEL: Record<Row["engineSetting"], string> = {
  auto: "Pick automatically",
  wordpress: "WordPress / WooCommerce",
  claude: "Claude Code (local folder)",
};

const PR_LABEL: Record<Row["prMode"], string> = {
  off: "edits the files directly",
  pr: "opens a pull request",
  pr_merge: "opens a pull request and merges it",
  pr_batch: "opens one pull request for the whole run",
};

/**
 * Autopilot, client by client: how far it may go, and whether the work is
 * done through the site's plugin (WordPress, WooCommerce) or by Claude Code
 * in the client's project folder, visible in the Claude window.
 */
export function ClientAutopilot({
  workspaceLevel,
  clients,
}: {
  workspaceLevel: AutonomyLevel;
  clients: Row[];
}) {
  if (clients.length === 0) return null;
  return (
    <section className="glass-apple rounded-xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-[#d97757]" />
        Autopilot per client
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick what the autopilot may do for each client. Sites with a WordPress or WooCommerce
        connection are changed through it; sites with a local project folder (and maybe a GitHub
        repo) are worked on by Claude Code, and you watch it in the Claude window.
      </p>
      <ul className="mt-4 divide-y divide-white/5">
        {clients.map((c) => (
          <ClientRow key={c.id} row={c} workspaceLevel={workspaceLevel} />
        ))}
      </ul>
    </section>
  );
}

function ClientRow({ row, workspaceLevel }: { row: Row; workspaceLevel: AutonomyLevel }) {
  const [level, setLevel] = useState<AutonomyLevel | "">(row.level ?? "");
  const [engineSetting, setEngineSetting] = useState(row.engineSetting);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const effective: AutonomyLevel = level === "" ? workspaceLevel : level;
  const acts = effective === "apply_safe" || effective === "apply_all";
  // What will really happen with the choice on screen.
  const engine: Row["engine"] =
    engineSetting === "wordpress"
      ? row.engine === "wordpress"
        ? "wordpress"
        : "none"
      : engineSetting === "claude"
        ? row.folder
          ? "claude"
          : "none"
        : row.engine;

  function save(patch: Parameters<typeof setClientAutopilot>[1]) {
    start(async () => {
      const r = await setClientAutopilot(row.id, patch);
      setMessage(r.ok ? null : (r.error ?? "Could not save."));
    });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-[8rem] text-sm font-medium">{row.name}</span>

        <select
          value={level}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value as AutonomyLevel | "";
            setLevel(v);
            save({ level: v === "" ? null : v });
          }}
          className="h-8 rounded-md border border-white/10 bg-card px-2 text-xs text-foreground [&_option]:bg-card [&_option]:text-foreground"
          aria-label={`Autopilot level for ${row.name}`}
        >
          <option value="">Follow workspace ({LEVEL_LABELS[workspaceLevel]})</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>

        <select
          value={engineSetting}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value as Row["engineSetting"];
            setEngineSetting(v);
            save({ engine: v });
          }}
          className="h-8 rounded-md border border-white/10 bg-card px-2 text-xs text-foreground [&_option]:bg-card [&_option]:text-foreground"
          aria-label={`Who does the work for ${row.name}`}
        >
          {(Object.keys(ENGINE_LABEL) as Row["engineSetting"][]).map((e) => (
            <option key={e} value={e}>
              {ENGINE_LABEL[e]}
            </option>
          ))}
        </select>

        <span className="flex-1" />

        <Button
          size="sm"
          disabled={busy || effective === "off"}
          onClick={() =>
            start(async () => {
              setMessage(null);
              const r = await runNow(row.id);
              setMessage(r.summary);
              if (r.openTaskId) openChat(r.openTaskId);
            })
          }
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run now
        </Button>
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {engine === "wordpress" && "Changes go through the site's WordPress connection."}
        {engine === "claude" && (
          <>
            Claude Code works in <span className="text-foreground/80">{row.folder}</span>
            {acts && (
              <>
                {" "}
                and {PR_LABEL[row.repo ? row.prMode : "off"]}
                {row.repo ? ` (${row.repo})` : ""}.
              </>
            )}
            {!acts && "."}
          </>
        )}
        {engine === "none" &&
          "Nothing to work with yet: connect the site's WordPress plugin, or set a Local project folder on the client's Edit page."}
      </p>

      {engine === "claude" && acts && (!row.repo || row.prMode === "off") && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>
            Without a GitHub repo in pull-request mode, Claude changes the files in the folder
            directly. Set a repo and &ldquo;open a pull request&rdquo; on the client&apos;s Edit page to
            review before anything lands.
          </span>
        </p>
      )}

      {message && <p className="mt-1.5 text-[11px] text-foreground/80">{message}</p>}
    </li>
  );
}
