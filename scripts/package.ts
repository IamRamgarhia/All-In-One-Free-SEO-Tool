/**
 * Builds a portable, double-click distribution under dist/.
 *
 * Layout produced:
 *   dist/
 *   ├── seo-tool.exe          (renamed copy of node.exe — runtime)
 *   ├── server.js             (Next.js standalone entrypoint)
 *   ├── start-seo-tool.bat    (Windows launcher — runs server + opens browser)
 *   ├── start-seo-tool.sh     (Linux/macOS launcher)
 *   ├── README.txt            (instructions)
 *   ├── .next/
 *   │   ├── server/...        (from standalone)
 *   │   └── static/...        (copied separately — standalone doesn't include)
 *   ├── public/...
 *   └── node_modules/...      (only what standalone bundled)
 *
 * The end-user double-clicks start-seo-tool.bat, which:
 *   1. Picks an open port (default 3000, falls back to 3001..3010)
 *   2. Launches seo-tool.exe with server.js
 *   3. Opens their default browser at http://localhost:PORT
 *   4. Stores the SQLite db (data.db) next to the .bat file
 */

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const distDir = join(root, "dist");
const standaloneDir = join(root, ".next", "standalone");
const staticDir = join(root, ".next", "static");
const publicDir = join(root, "public");

const log = (...args: unknown[]) => console.log("[package]", ...args);

function step(name: string) {
  log(`\n━━━ ${name} ━━━`);
}

step("Cleaning dist/");
if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

step("Running production build (next build)");
try {
  execSync("pnpm build", { cwd: root, stdio: "inherit" });
} catch {
  log("Build failed — aborting.");
  process.exit(1);
}

if (!existsSync(standaloneDir)) {
  log(`ERROR: ${standaloneDir} not found.`);
  log(
    'Make sure next.config.ts has output: "standalone" and that the build finished successfully.',
  );
  process.exit(1);
}

step("Copying standalone server");
cpSync(standaloneDir, distDir, { recursive: true });

step("Copying .next/static");
const distStatic = join(distDir, ".next", "static");
mkdirSync(distStatic, { recursive: true });
cpSync(staticDir, distStatic, { recursive: true });

step("Copying public/");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(distDir, "public"), { recursive: true });
}

step("Bundling Node runtime (renaming to seo-tool.exe)");
const nodeBinary = process.execPath;
const targetExe = join(
  distDir,
  process.platform === "win32" ? "seo-tool.exe" : "seo-tool",
);
cpSync(nodeBinary, targetExe);
log(`copied ${nodeBinary} → ${targetExe}`);

step("Writing Windows launcher (start-seo-tool.bat)");
const batLauncher = `@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

REM Pick a free port
set "PORT=3000"
for /l %%p in (3000,1,3010) do (
    netstat -an | findstr ":%%p " | findstr /i "LISTENING" >nul
    if errorlevel 1 (
        set "PORT=%%p"
        goto :found
    )
)
:found

set "URL=http://localhost:%PORT%"

REM SQLite db lives next to the .bat
set "SEO_DB_PATH=%ROOT%data.db"
set "HOSTNAME=127.0.0.1"

echo.
echo  SEO tool — starting at %URL%
echo  Database: %SEO_DB_PATH%
echo  Press Ctrl+C in this window to stop.
echo.

REM Open the browser after a short delay (so server has time to bind)
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start "" "%URL%""

REM Run the server (blocks)
"%ROOT%seo-tool.exe" "%ROOT%server.js"
endlocal
`;
writeFileSync(join(distDir, "start-seo-tool.bat"), batLauncher, "utf8");

step("Writing Unix launcher (start-seo-tool.sh)");
const shLauncher = `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

PORT=3000
while lsof -i ":$PORT" -t >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ $PORT -gt 3010 ]; then break; fi
done

URL="http://localhost:$PORT"
export PORT
export SEO_DB_PATH="$(pwd)/data.db"
export HOSTNAME="127.0.0.1"

echo
echo "  SEO tool — starting at $URL"
echo "  Database: $SEO_DB_PATH"
echo "  Press Ctrl+C in this window to stop."
echo

(
  sleep 2
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL"
  fi
) &

./seo-tool server.js
`;
writeFileSync(join(distDir, "start-seo-tool.sh"), shLauncher, {
  encoding: "utf8",
});

// Make the .sh executable on Unix-friendly file systems (no-op on Windows NTFS but harmless)
try {
  execSync(`chmod +x "${join(distDir, "start-seo-tool.sh")}"`, {
    stdio: "ignore",
  });
} catch {
  // Windows — chmod doesn't exist, ignore
}

step("Writing README.txt");
const readme = `SEO TOOL — PORTABLE BUILD
=========================

This folder is a fully self-contained build. No installation required.

To start:

  Windows:  Double-click start-seo-tool.bat
  Mac/Linux: Run ./start-seo-tool.sh in a terminal

The app will:
  1. Start a local server on http://localhost:3000 (or next available port)
  2. Open the page in your default browser
  3. Save all your data in data.db (a single file in this folder)

To stop the app: close the console window, or press Ctrl+C in it.

To move your data: copy data.db (your full database, including all clients,
audits, tasks, and keywords). The app reads it from this folder on startup.

To uninstall: just delete this folder.

Generated: ${new Date().toISOString()}
`;
writeFileSync(join(distDir, "README.txt"), readme, "utf8");

step("Done");
log(`Distribution ready: ${distDir}`);
log("");
log("Try it now:");
log(`  cd ${distDir}`);
log("  start-seo-tool.bat   (Windows)");
log("  ./start-seo-tool.sh  (Mac/Linux)");
