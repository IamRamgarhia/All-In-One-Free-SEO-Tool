"use server";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Writes the Claude Desktop config for the user instead of asking them
 * to hand-edit JSON.
 *
 * Editing that file by hand goes wrong in ways that are hard to see and
 * hard to diagnose. The failure that prompted this: pasting the snippet
 * at the end of an existing file produced two JSON objects back to back,
 * and Claude Desktop refused to start with "Unexpected non-whitespace
 * character after JSON at position 1401" — a message that says nothing
 * about what to do. A missing comma between servers does the same, and
 * takes every other server down with it.
 *
 * So this merges programmatically: parse, add one key, re-serialise.
 * There is no way to produce invalid JSON that way, and anything already
 * in the file is preserved.
 */

export type InstallResult =
  | {
      ok: true;
      /** The file that was written. */
      configPath: string;
      /** Where the previous version was saved, if there was one. */
      backupPath: string | null;
      /** Servers now configured, so the user can see nothing was lost. */
      servers: string[];
      /** True when the file already had a seo-tool entry we replaced. */
      replaced: boolean;
    }
  | { ok: false; error: string };

/**
 * Where Claude Desktop keeps its config.
 *
 * The documented Windows path is %APPDATA%\Claude. That is wrong for the
 * Microsoft Store build, which virtualises %APPDATA% into its package
 * folder — looking in the documented place finds nothing and suggests
 * the app was never installed. Both are checked, existing files first.
 */
function candidatePaths(): string[] {
  const home = os.homedir();
  const out: string[] = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    out.push(path.join(appData, "Claude", "claude_desktop_config.json"));

    const local =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    const packages = path.join(local, "Packages");
    try {
      for (const dir of fs.readdirSync(packages)) {
        if (!dir.toLowerCase().startsWith("claude")) continue;
        out.push(
          path.join(
            packages,
            dir,
            "LocalCache",
            "Roaming",
            "Claude",
            "claude_desktop_config.json",
          ),
        );
      }
    } catch {
      // No Packages directory, or not readable — the plain path stands.
    }
  } else if (process.platform === "darwin") {
    out.push(
      path.join(
        home,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
    );
  } else {
    out.push(path.join(home, ".config", "Claude", "claude_desktop_config.json"));
  }

  return out;
}

/** An existing file wins; otherwise the first candidate is created. */
function resolveConfigPath(): string {
  const candidates = candidatePaths();
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

export async function installDesktopConfig(): Promise<InstallResult> {
  try {
    const root = process.cwd();

    // Every path absolute, and tsconfig and the database named outright.
    // Claude Desktop does not run the server in the cwd the config asks
    // for, and both tsx's alias resolution and the database location are
    // cwd-relative — so leaving either implicit means the server starts
    // on this machine and dies under Claude Desktop.
    const entry = {
      command: process.execPath,
      args: [
        path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        "--tsconfig",
        path.join(root, "tsconfig.json"),
        path.join(root, "scripts", "mcp-server.ts"),
      ],
      cwd: root,
      env: { SEO_DB_PATH: path.join(root, "data.db") },
    };

    for (const p of [entry.args[0], entry.args[2], entry.args[3], entry.command]) {
      if (!fs.existsSync(p)) {
        return {
          ok: false,
          error: `Can't write the config: ${p} does not exist. Run the install once (pnpm install) and try again.`,
        };
      }
    }

    const configPath = resolveConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    let existing: Record<string, unknown> = {};
    let backupPath: string | null = null;

    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf8");
      backupPath = `${configPath}.backup-${Date.now()}`;
      fs.writeFileSync(backupPath, raw);

      const trimmed = raw.trim();
      if (trimmed) {
        try {
          existing = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          // The file is already broken — very likely by a previous
          // hand-edit. Refuse rather than overwrite settings we cannot
          // read; the backup above means nothing is lost either way.
          return {
            ok: false,
            error: `${configPath} isn't valid JSON, so your existing settings can't be read. A copy is saved at ${backupPath}. Fix or delete the file, then try again.`,
          };
        }
      }
    }

    const servers =
      (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
    const replaced = Object.prototype.hasOwnProperty.call(servers, "seo-tool");
    existing.mcpServers = { ...servers, "seo-tool": entry };

    fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`);

    // Read it back. Writing a file the app cannot parse is the exact
    // failure this exists to prevent, so it is worth proving.
    const check = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      mcpServers?: Record<string, unknown>;
    };

    return {
      ok: true,
      configPath,
      backupPath,
      servers: Object.keys(check.mcpServers ?? {}),
      replaced,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
