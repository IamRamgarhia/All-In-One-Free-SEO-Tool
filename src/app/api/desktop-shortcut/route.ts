/**
 * Create Windows shortcuts (.lnk) on the user's Desktop and in their
 * Start Menu so they can launch the app even after the server is off.
 *
 *   GET  → reports which shortcuts already exist
 *   POST → creates them (idempotent — safe to run twice)
 *   DELETE → removes them
 *
 * Uses PowerShell + WScript.Shell COM, which is built into every Windows
 * install. No extra deps.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { detectPortFromRequest, rememberPort } from "@/lib/port-memory";
import { guardAdminRequest } from "@/lib/admin-auth";

const exec = promisify(execFile);

export const dynamic = "force-dynamic";
// Required: spawns PowerShell + reads/writes filesystem. Edge can't.
export const runtime = "nodejs";

function getPaths() {
  const home = os.homedir();
  const cwd = process.cwd();
  const desktop = path.join(home, "Desktop", "SEO Tool.lnk");
  const startMenu = path.join(
    home,
    "AppData",
    "Roaming",
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "SEO Tool.lnk",
  );
  const target = path.join(cwd, "seo.cmd");
  // Prefer the .ico file (Windows renders ICO natively at every size);
  // fall back to PNG if generation hasn't run yet.
  const icoPath = path.join(cwd, "public", "icon.ico");
  const pngPath = path.join(cwd, "public", "icon-192.png");
  const icon = existsSync(icoPath) ? icoPath : pngPath;
  return { desktop, startMenu, target, icon, cwd };
}

export async function GET(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  if (process.platform !== "win32") {
    return Response.json({
      ok: false,
      error: "Shortcuts are Windows-only. On macOS / Linux use the install-as-PWA option.",
      desktopExists: false,
      startMenuExists: false,
    });
  }
  const { desktop, startMenu } = getPaths();
  return Response.json({
    ok: true,
    desktopExists: existsSync(desktop),
    startMenuExists: existsSync(startMenu),
  });
}

export async function POST(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  if (process.platform !== "win32") {
    return Response.json(
      { ok: false, error: "Shortcuts are Windows-only." },
      { status: 400 },
    );
  }

  const { desktop, startMenu, target, icon, cwd } = getPaths();

  if (!existsSync(target)) {
    return Response.json(
      {
        ok: false,
        error: "seo.cmd not found in the install folder. Update to latest, then try again.",
      },
      { status: 500 },
    );
  }

  // Detect the port the user is currently on and persist it so seo.cmd
  // reads it back when launched via the new shortcut. The shortcut
  // itself doesn't need port baked in — seo.cmd reads .seo-port — so
  // both the desktop and Start Menu icons stay in sync if the port
  // ever changes (e.g. user later restarts on a different port).
  const port = detectPortFromRequest(req);
  await rememberPort(port).catch(() => undefined);

  // PowerShell one-liner: create both .lnk files via WScript.Shell COM.
  // Single-quoted paths so backslashes don't escape.
  const ps = `
$ws = New-Object -ComObject WScript.Shell
foreach ($p in @('${desktop.replace(/'/g, "''")}', '${startMenu.replace(/'/g, "''")}')) {
  $dir = Split-Path -Parent $p
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $s = $ws.CreateShortcut($p)
  $s.TargetPath = '${target.replace(/'/g, "''")}'
  $s.WorkingDirectory = '${cwd.replace(/'/g, "''")}'
  $s.IconLocation = '${icon.replace(/'/g, "''")}, 0'
  $s.Description = 'SEO Tool — local SEO platform (port ${port})'
  $s.WindowStyle = 7
  $s.Save()
}
Write-Output 'ok'
`.trim();

  try {
    await exec(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { cwd, timeout: 15_000 },
    );
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: `Could not write shortcut: ${(err as Error).message.slice(0, 200)}`,
      },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    port,
    message: `Shortcuts created (bound to port ${port}). Look on your Desktop and in Start Menu → SEO Tool. Right-click the Start Menu entry → Pin to taskbar for one-click access.`,
    paths: { desktop, startMenu },
  });
}

export async function DELETE(req: Request) {
  const denied = guardAdminRequest(req);
  if (denied) return denied;

  if (process.platform !== "win32") {
    return Response.json(
      { ok: false, error: "Shortcuts are Windows-only." },
      { status: 400 },
    );
  }
  const { desktop, startMenu } = getPaths();
  const ps = `
foreach ($p in @('${desktop.replace(/'/g, "''")}', '${startMenu.replace(/'/g, "''")}')) {
  if (Test-Path $p) { Remove-Item -Path $p -Force }
}
Write-Output 'ok'
`.trim();
  try {
    await exec(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { cwd: process.cwd(), timeout: 10_000 },
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message.slice(0, 200) },
      { status: 500 },
    );
  }
  return Response.json({ ok: true, message: "Shortcuts removed." });
}
