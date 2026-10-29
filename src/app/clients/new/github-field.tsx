"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Repo = { name: string; defaultBranch: string; private: boolean };
type State =
  | { phase: "loading" }
  | { phase: "ready"; user: string; repos: Repo[]; suggested: { repo: string; branch: string | null } | null }
  | { phase: "error"; message: string };

/**
 * Pick the client's GitHub repository from the ones the signed-in GitHub
 * CLI can see. The branch follows the repo's own default (usually main), so
 * there is nothing to type. The repo the project folder already points at
 * is offered as a one-click shortcut.
 */
export function GithubField({
  repo,
  branch,
  folder,
  onPick,
}: {
  repo: string;
  branch: string;
  folder: string;
  onPick: (repo: string, branch: string) => void;
}) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/github-repos?path=${encodeURIComponent(folder.trim())}`)
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        setState(
          j.ok
            ? { phase: "ready", user: j.user, repos: j.repos, suggested: j.suggested }
            : { phase: "error", message: j.error ?? "Could not reach GitHub." },
        );
      })
      .catch(() => {
        if (live) setState({ phase: "error", message: "Could not reach GitHub." });
      });
    return () => {
      live = false;
    };
    // The folder only decides the suggestion; typing in it must not refetch on every key.
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const repos = state.phase === "ready" ? state.repos : [];
  const suggested = state.phase === "ready" ? state.suggested : null;
  const known = repos.some((r) => r.name === repo);

  return (
    <div className="space-y-1.5 md:col-span-2">
      <div className="flex items-center justify-between">
        <label htmlFor="github-repo-select" className="text-xs font-medium">
          GitHub repository
        </label>
        {state.phase === "ready" && (
          <span className="text-[11px] text-emerald-300">Connected as {state.user}</span>
        )}
      </div>
      <input type="hidden" name="githubRepo" value={repo} />
      <input type="hidden" name="baseBranch" value={branch} />

      {state.phase === "loading" && (
        <div className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-card/60 px-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Connecting to GitHub…
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <span>{state.message}</span>
          <button
            type="button"
            onClick={() => {
              setState({ phase: "loading" });
              setNonce((n) => n + 1);
            }}
            className="shrink-0 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
          >
            Retry
          </button>
        </div>
      )}

      {state.phase === "ready" && (
        <>
          <select
            id="github-repo-select"
            value={repo}
            onChange={(e) => {
              const r = repos.find((x) => x.name === e.target.value);
              onPick(e.target.value, r?.defaultBranch ?? "main");
            }}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="">Not connected</option>
            {repo && !known && <option value={repo}>{repo}</option>}
            {repos.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
                {r.private ? " (private)" : ""}
              </option>
            ))}
          </select>
          {suggested && suggested.repo !== repo && (
            <button
              type="button"
              onClick={() => {
                const r = repos.find((x) => x.name === suggested.repo);
                onPick(suggested.repo, suggested.branch ?? r?.defaultBranch ?? "main");
              }}
              className="text-[11px] text-violet-300 hover:underline"
            >
              Use {suggested.repo}, the repository this folder is already connected to
            </button>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        {repo
          ? `Pull requests are opened against ${branch || "main"}.`
          : "Optional. Lets Claude work through pull requests, using the GitHub CLI already signed in on this machine."}
      </p>
    </div>
  );
}
