# One-line installer for Windows. Run via:
#   iwr -useb https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.ps1 | iex
#
# What it does:
#   1. Downloads the repo as a ZIP (no git required)
#   2. Auto-detects a free local port (default 3000)
#   3. If Docker Desktop is running -> uses Docker (recommended, handles everything)
#   4. Otherwise -> falls back to native Node install
#   5. Waits for /api/v1/health to confirm the app is actually up
#   6. Opens the browser to http://localhost:<PORT>
#   7. Drops SEO-Tool-Welcome.txt on the user's Desktop
#
# Idempotent. Safe to re-run for upgrades.

# IMPORTANT: don't use "Stop" globally - native tools (git, docker, npm) write
# normal status output to stderr and PowerShell strict-mode treats it as an
# error. Use try/catch where actual errors matter.
$ErrorActionPreference = "Continue"
$ProgressPreference   = "SilentlyContinue"  # speeds up Invoke-WebRequest 5-10x

# ---- config ----------------------------------------------------------------
$repoOwner   = "IamRamgarhia"
$repoName    = "SEO-Tool"
$branch      = if ($env:SEO_BRANCH) { $env:SEO_BRANCH } else { "main" }
$zipUrl      = "https://codeload.github.com/$repoOwner/$repoName/zip/refs/heads/$branch"
$dir         = if ($env:SEO_INSTALL_DIR) { $env:SEO_INSTALL_DIR } else { Join-Path $HOME "seo" }
$defaultPort = if ($env:SEO_PORT) { [int]$env:SEO_PORT } else { 3000 }
$desktop     = Join-Path $HOME "Desktop"

# ---- LOGGING -----------------------------------------------------------------
# Log everything to BOTH the console AND a file the user can send for support.
# Start the transcript at a temp location since $dir may not exist yet; we
# copy it to $dir\install.log at the end (and to the Desktop as a fallback).
$logPath     = Join-Path $env:TEMP "seo-tool-install.log"
$desktopLog  = Join-Path $desktop "SEO-Tool-install.log"
try { Stop-Transcript | Out-Null } catch {}
try {
    Start-Transcript -Path $logPath -Force | Out-Null
} catch {
    Write-Host "Could not start install transcript: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ---- ALWAYS PAUSE BEFORE EXIT ------------------------------------------------
# If this script runs from a double-click or `iex` and hits Die / throws,
# the window normally vanishes - user sees nothing. This handler keeps it
# open and tells them where the log is.
function Save-LogAndExit([bool]$failed) {
    try { Stop-Transcript | Out-Null } catch {}
    # Copy log into the install dir (if it exists) AND onto the Desktop
    # so the user can find it without knowing the install path.
    try {
        if (Test-Path $dir) { Copy-Item $logPath (Join-Path $dir "install.log") -Force -ErrorAction SilentlyContinue }
        if (Test-Path $desktop) { Copy-Item $logPath $desktopLog -Force -ErrorAction SilentlyContinue }
    } catch {}
    Write-Host ""
    if ($failed) {
        Write-Host "============================================================" -ForegroundColor Red
        Write-Host "  INSTALL FAILED" -ForegroundColor Red
        Write-Host "============================================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "  Log saved to:"
        Write-Host "    $logPath"
        if (Test-Path $desktop) {
            Write-Host "    $desktopLog  (copy on your Desktop)"
        }
        Write-Host ""
        Write-Host "  To get help, email this log to: Contact@dicecodes.com"
        Write-Host "  Or open an issue with the log attached:"
        Write-Host "    https://github.com/IamRamgarhia/SEO-Tool/issues"
    } else {
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "  INSTALL FINISHED" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Log saved to:  $logPath"
        Write-Host "  Also copied to: $desktopLog"
    }
    Write-Host ""
    # Only pause if running interactively (skip in CI / piped contexts)
    if ([Environment]::UserInteractive -and $Host.UI.RawUI) {
        try { Read-Host "Press Enter to close this window" } catch {}
    }
}

function Say($m)  { Write-Host "-> $m" -ForegroundColor Green }
function Info($m) { Write-Host "i  $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X  $m" -ForegroundColor Red; Save-LogAndExit $true; exit 1 }

# DieMulti - print multi-line error WITHOUT using PowerShell here-strings.
# Here-strings (@"..."@) break under `iwr | iex` invocation in PS 5.1:
# the close marker `"@` isn't recognized and the parser consumes everything
# to EOF. Using an array of strings + Write-Host avoids that entire class.
function DieMulti {
    param([string[]]$Lines)
    Write-Host ""
    Write-Host "X  $(if ($Lines.Count -gt 0) { $Lines[0] } else { 'Fatal error' })" -ForegroundColor Red
    if ($Lines.Count -gt 1) {
        for ($i = 1; $i -lt $Lines.Count; $i++) {
            Write-Host "   $($Lines[$i])" -ForegroundColor Red
        }
    }
    Save-LogAndExit $true
    exit 1
}

# Trap for unhandled errors - keeps the window open even when something
# crashes unexpectedly (PowerShell parse errors, .NET exceptions, etc.)
trap {
    Write-Host ""
    Write-Host "X  Unhandled error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   At: $($_.InvocationInfo.PositionMessage)" -ForegroundColor Red
    Save-LogAndExit $true
    exit 1
}

Say "SEO Tool installer"
Info "Install location: $dir"
Info "Install log: $logPath"

# ---- 1. download / refresh repo via ZIP (no git required) -------------------
$tmpZip = Join-Path $env:TEMP "seo-tool-$(Get-Random).zip"
$tmpExtract = Join-Path $env:TEMP "seo-tool-extract-$(Get-Random)"

try {
    Say "Downloading the latest code (no git required)"
    Invoke-WebRequest -Uri $zipUrl -OutFile $tmpZip -UseBasicParsing -ErrorAction Stop
} catch {
    Die "Couldn't download the code. Check your internet connection. ($($_.Exception.Message))"
}

try {
    Say "Extracting"
    if (Test-Path $tmpExtract) { Remove-Item -Recurse -Force $tmpExtract }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force -ErrorAction Stop
} catch {
    Die "Couldn't extract the ZIP. ($($_.Exception.Message))"
}

# GitHub ZIPs extract as <repo>-<branch>/. Move into final location, preserving
# any existing data.db etc. that the user already has.
$extracted = Get-ChildItem -Path $tmpExtract -Directory | Select-Object -First 1
if (-not $extracted) { Die "ZIP didn't contain expected folder." }

if (Test-Path $dir) {
    Say "Existing install found at $dir - refreshing in place (your data is preserved)"
    # Stop any running dev server BEFORE we copy over its files. Otherwise
    # the .next folder + node_modules have locked files (node.exe is holding
    # them) and robocopy + future folder deletion both fail.
    $oldPidFile = Join-Path $dir ".dev-server.pid"
    if (Test-Path $oldPidFile) {
        $oldPid = Get-Content $oldPidFile -ErrorAction SilentlyContinue
        if ($oldPid) {
            try {
                Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                Say "  Stopped existing dev server (PID $oldPid)"
            } catch {}
        }
    }
    # Also clear anything still bound to the saved port - catches the case
    # where the PID file is missing/stale but the server is still up.
    $savedPortFile = Join-Path $dir ".seo-port"
    if (Test-Path $savedPortFile) {
        $savedPort = (Get-Content $savedPortFile -ErrorAction SilentlyContinue) -replace '\s', ''
        if ($savedPort -match '^\d+$') {
            try {
                $boundConns = Get-NetTCPConnection -LocalPort ([int]$savedPort) -State Listen -ErrorAction SilentlyContinue
                foreach ($c in $boundConns) {
                    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
                    Say "  Freed port $savedPort (PID $($c.OwningProcess))"
                }
            } catch {}
        }
    }
    Start-Sleep -Seconds 1   # let Windows release file locks
    # Copy files over, overwriting but NOT deleting things the ZIP doesn't have
    # (so user data like data.db stays).
    robocopy $extracted.FullName $dir /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
} else {
    Say "Installing fresh into $dir"
    Move-Item -Path $extracted.FullName -Destination $dir -Force
}

# Cleanup temp files
Remove-Item -Path $tmpZip -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue

Set-Location $dir

# ---- 2. find a free port ----------------------------------------------------
# Port strategy (see scripts/pick-port.cjs for the canonical impl):
#   1. If .seo-port already exists (re-install / upgrade), honor it so
#      the user's bookmark keeps working.
#   2. If user passed SEO_PORT, honor that.
#   3. Otherwise derive a stable port inside IANA's ephemeral range
#      (49152-65535) from a hash of the install path. Different installs
#      land on different ports automatically, and we never collide with
#      well-known dev defaults (3000/5173/8000/8080 etc.).
#   4. If the chosen port is busy, probe upward.

function Test-PortInUse($p) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn)
    } catch { return $false }
}

function Get-PreferredPort($installPath) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($installPath)
        $hash = $sha.ComputeHash($bytes)
    } finally {
        $sha.Dispose()
    }
    # Read first 4 bytes as a uint32 (big-endian to match Node version)
    $n = [uint32]($hash[0]) -shl 24
    $n = $n -bor ([uint32]($hash[1]) -shl 16)
    $n = $n -bor ([uint32]($hash[2]) -shl 8)
    $n = $n -bor [uint32]($hash[3])
    $EphemeralMin = 49152
    $EphemeralSpan = 16383
    return [int]($EphemeralMin + ($n % $EphemeralSpan))
}

$existingPortFile = Join-Path $dir ".seo-port"
$port = 0
if (Test-Path $existingPortFile) {
    $raw = (Get-Content $existingPortFile -ErrorAction SilentlyContinue) -replace '\s', ''
    if ($raw -match '^\d+$') {
        $port = [int]$raw
        Info "Using existing port from .seo-port: $port"
    }
}

if ($port -eq 0) {
    if ($env:SEO_PORT) {
        $port = [int]$env:SEO_PORT
        Info "Using SEO_PORT from environment: $port"
    } else {
        $port = Get-PreferredPort $dir
        Info "Picked stable port $port from install path (ephemeral range)"
    }
}

# Probe upward if occupied. Stay inside the ephemeral range; wrap once.
if (Test-PortInUse $port) {
    Warn "Port $port is occupied - probing for a free one"
    $start = $port
    $found = $false
    for ($step = 1; $step -le 200; $step++) {
        $try = $start + $step
        if ($try -gt 65535) { $try = 49152 + ($try - 65536) }
        if (-not (Test-PortInUse $try)) {
            $port = $try
            $found = $true
            break
        }
    }
    if (-not $found) {
        DieMulti @(
            "Could not find a free port in the ephemeral range after 200 probes.",
            "Set SEO_PORT to a known-free port and re-run, e.g.:",
            '  $env:SEO_PORT = "7777"',
            "  iwr -useb https://raw.githubusercontent.com/IamRamgarhia/SEO-Tool/main/install.ps1 | iex"
        )
    }
}
Say "Using port $port"

# Persist the chosen port so START.cmd / STOP.cmd pick it up on next launch.
# Without this, the desktop shortcut tries 3000 even after the installer
# rerouted to 3001+.
try {
    [System.IO.File]::WriteAllText((Join-Path $dir ".seo-port"), "$port", [System.Text.Encoding]::ASCII)
} catch {
    Warn "Could not write .seo-port (port persistence): $($_.Exception.Message)"
}

# ---- 3. detect Docker -------------------------------------------------------
$hasDocker = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    # Suppress BOTH stdout and stderr - docker prints a noisy pipe-not-found
    # message when Docker Desktop isn't running, which scares users into
    # thinking the installer crashed.
    $null = & cmd /c "docker info >nul 2>&1"
    if ($LASTEXITCODE -eq 0) { $hasDocker = $true }
}

# ---- 4. install path: Docker or native -------------------------------------
$up = $false

if ($hasDocker) {
    Say "Docker detected - using Docker install (handles everything: Node, Chromium, deps)"

    docker compose version 2>$null 1>$null
    if ($LASTEXITCODE -ne 0) {
        Die "Docker is installed but 'docker compose' v2 is missing. Update Docker Desktop from https://www.docker.com/products/docker-desktop/"
    }

    $env:SEO_HOST_PORT = "$port"
    Say "Building image (first run: 3-5 min. Re-runs: seconds.)"
    docker compose up -d --build

    if ($LASTEXITCODE -ne 0) {
        Die "Docker build failed. Check: cd '$dir'; docker compose logs"
    }

    Say "Waiting for the app to come up..."
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$port/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $up = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
    }
    Write-Host ""

    if (-not $up) {
        Warn "App didn't respond after 2 minutes. Check: cd '$dir'; docker compose logs -f"
    } else {
        Say "App is up at http://localhost:$port"
    }
}
else {
    Warn "Docker not detected. Native install path."
    Write-Host ""
    Info "TIP: install Docker Desktop and re-run for a true one-command setup:"
    Info "     https://www.docker.com/products/docker-desktop/"
    Write-Host ""

    # Check Node
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        DieMulti @(
            "Node.js is required for the native install.",
            "",
            "Quickest install:",
            "  winget install OpenJS.NodeJS.LTS",
            "",
            "Or download from https://nodejs.org/ (pick the LTS version).",
            "",
            "After installing, CLOSE this PowerShell window, open a NEW one,",
            "and re-run this installer."
        )
    }

    $nodeFullVersion = (node -v 2>$null) -replace '^v', ''
    $nodeMajor = [int]($nodeFullVersion -split '\.')[0]

    if ($nodeMajor -lt 20) {
        DieMulti @(
            "Node $nodeFullVersion is too old. This installer needs Node 22 LTS.",
            "",
            "Quick fix (one command):",
            "  winget install OpenJS.NodeJS.LTS",
            "",
            "After that, CLOSE this PowerShell window, open a NEW one,",
            "and re-run this installer."
        )
    }

    # Node 22 LTS, 23, 24, 25, 26 all supported by better-sqlite3 12.10.0+
    # (which is what we ship). No version-blocking - just an info note.
    if ($nodeMajor -gt 22) {
        Info "Node $nodeFullVersion is current/non-LTS. better-sqlite3 12.10+ has prebuilts for it - should work fine."
    }
    Say "Node $nodeFullVersion detected - supported."

    # Pick package manager - enable corepack so pnpm/yarn work without separate install
    $pm = $null
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        $pm = "pnpm"
    } else {
        # Try corepack - ships with Node 16.10+, gives us pnpm without npm install -g
        if (Get-Command corepack -ErrorAction SilentlyContinue) {
            Say "Enabling pnpm via corepack"
            corepack enable 2>$null 1>$null
            corepack prepare pnpm@latest --activate 2>$null 1>$null
            if (Get-Command pnpm -ErrorAction SilentlyContinue) {
                $pm = "pnpm"
            }
        }
        if (-not $pm) {
            Warn "pnpm not available; falling back to npm (slower)"
            $pm = "npm"
        }
    }
    Say "Using $pm"

    # ============================================================
    # DEPENDENCY INSTALL - pnpm 11+ build-script bypass strategy
    # ============================================================
    # pnpm 11+ blocks native build scripts unless approved via an
    # interactive prompt OR allowlisted in package.json. Various .npmrc
    # keys to disable the check are inconsistently honored across pnpm
    # minor versions, so we bypass entirely with --ignore-scripts and
    # then explicitly run pnpm rebuild afterwards, verifying the
    # critical native bindings exist on disk before continuing.

    # Env vars as belt-and-suspenders for pnpm 11's build-script policy.
    $env:NPM_CONFIG_IGNORED_BUILDS_CHECK = "false"
    $env:NPM_CONFIG_IGNORED_BUILDS_FAIL_INSTALL = "false"
    $env:NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS = "true"
    $env:NPM_CONFIG_AUTO_APPROVE_BUILDS = "true"

    Say "Installing dependencies (1-2 min first time, ~15s on re-runs)."
    # --ignore-scripts bypasses pnpm 11's build-script gate (we run them
    # manually via rebuild below). --prefer-offline uses the local
    # pnpm-store cache when possible (10x faster on re-runs).
    & $pm install --ignore-scripts --prefer-offline
    $installOk = ($LASTEXITCODE -eq 0)

    if (-not $installOk) {
        # Nuclear fallback: wipe node_modules + lockfile, retry, then npm.
        Warn "pnpm install --ignore-scripts failed. Wiping node_modules + lockfile..."
        if (Test-Path "node_modules")  { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
        if (Test-Path "pnpm-lock.yaml") { Remove-Item -Force "pnpm-lock.yaml" -ErrorAction SilentlyContinue }
        & $pm install --ignore-scripts
        $installOk = ($LASTEXITCODE -eq 0)
    }

    if (-not $installOk -and (Get-Command npm -ErrorAction SilentlyContinue)) {
        Warn "Falling back to npm install (no build-script restrictions)..."
        if (Test-Path "node_modules")  { Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue }
        if (Test-Path "pnpm-lock.yaml") { Remove-Item -Force "pnpm-lock.yaml" -ErrorAction SilentlyContinue }
        & npm install --no-audit --no-fund --ignore-scripts
        $installOk = ($LASTEXITCODE -eq 0)
    }

    if (-not $installOk) {
        Die "Dependency install failed after multiple recovery attempts. See log for details."
    }

    # ============================================================
    # NATIVE MODULE REBUILD - 4-strategy cascade to get binaries on disk
    # ============================================================
    # better-sqlite3 MUST have its .node compiled binding or the app
    # will not start. We try increasingly aggressive strategies to
    # produce the binding, verifying on disk after each attempt.
    # `*>&1` captures ALL PowerShell streams from native commands -
    # the bare `& cmd` form drops output on PS 5.1's transcript.

    function Find-SqliteBinding {
        if (-not (Test-Path "node_modules")) { return $null }
        return Get-ChildItem -Path "node_modules" -Recurse -Filter "better_sqlite3.node" -ErrorAction SilentlyContinue -Force | Select-Object -First 1
    }

    # Find the actual better-sqlite3 package dir. pnpm hoists into either:
    #   node_modules/better-sqlite3/package.json
    #   node_modules/.pnpm/better-sqlite3@VER/node_modules/better-sqlite3/package.json
    # CRITICAL: must EXCLUDE @types/better-sqlite3 (TS type defs, no native code)
    function Find-SqlitePkgDir {
        if (-not (Test-Path "node_modules")) { return $null }
        $packageJson = Get-ChildItem -Path "node_modules" -Recurse -Filter "package.json" -ErrorAction SilentlyContinue -Force |
            Where-Object {
                # Path must end in /better-sqlite3/package.json AND NOT contain @types
                $_.FullName -match "[\\/]better-sqlite3[\\/]package\.json$" -and
                $_.FullName -notmatch "@types"
            } |
            Select-Object -First 1
        if ($packageJson) { return $packageJson.Directory.FullName }
        return $null
    }

    Say "Building native modules (better-sqlite3, sharp, esbuild). Output streams below."

    # Strategy 1: pnpm install --force re-runs everything including build
    # scripts. pnpm 11+ DOES NOT support --force on the `rebuild` command
    # (that's why our previous attempt failed with "Unknown option: 'force'").
    # `install --force` is the right call.
    Say "  [1/3] pnpm install --force (re-runs build scripts)"
    & $pm install --force *>&1 | ForEach-Object { Write-Host $_ }

    $sqliteBinding = Find-SqliteBinding

    if (-not $sqliteBinding) {
        # Strategy 2: run prebuild-install directly inside the package.
        # Downloads precompiled .node from WiseLibs/better-sqlite3 GitHub
        # releases. Bypasses pnpm's build-script gate entirely.
        $sqlitePkg = Find-SqlitePkgDir
        if ($sqlitePkg) {
            Warn "  [2/3] Running prebuild-install directly inside $sqlitePkg"
            Push-Location $sqlitePkg
            try {
                & npx --yes prebuild-install *>&1 | ForEach-Object { Write-Host $_ }
            } finally {
                Pop-Location
            }
            $sqliteBinding = Find-SqliteBinding
        } else {
            Warn "  Could not find the better-sqlite3 package directory in node_modules!"
        }
    }

    if (-not $sqliteBinding) {
        # Strategy 3: cd into package and run npm rebuild (uses node-gyp).
        # ONLY path that needs the C++ toolchain. If this fails, the user
        # genuinely needs to install Visual Studio Build Tools.
        $sqlitePkg = Find-SqlitePkgDir
        if ($sqlitePkg) {
            Warn "  [3/3] npm rebuild inside $sqlitePkg (last resort, needs C++ toolchain)"
            Push-Location $sqlitePkg
            try {
                & npm rebuild *>&1 | ForEach-Object { Write-Host $_ }
            } finally {
                Pop-Location
            }
            $sqliteBinding = Find-SqliteBinding
        }
    }

    if (-not $sqliteBinding) {
        # All four strategies failed. Could be:
        # - No C++ build toolchain (most common on Windows)
        # - Network blocking access to GitHub releases
        # - Node version with no prebuilt + no toolchain to compile
        DieMulti @(
            "better-sqlite3 native module FAILED to build.",
            "",
            "Most likely cause: missing C++ build toolchain.",
            "",
            "QUICK FIX (one command, ~3 GB, ~10 min):",
            '  winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"',
            "  winget install Python.Python.3.12",
            "Then re-run this installer.",
            "",
            "ALTERNATIVE: install Node 22 LTS (has prebuilts, no toolchain needed):",
            "  winget uninstall OpenJS.NodeJS",
            "  winget install OpenJS.NodeJS.LTS",
            "Then close + reopen PowerShell, re-run installer.",
            "",
            "If behind corporate proxy/firewall:",
            "  Check access to https://github.com/WiseLibs/better-sqlite3/releases",
            "",
            "Log file: $logPath"
        )
    }

    Say "better-sqlite3 binding verified: $($sqliteBinding.FullName)"

    # ============================================================
    # PLAYWRIGHT - chromium download for rank checking + SERP scan
    # ============================================================
    Say "Downloading Playwright Chromium (~170 MB, one-time). May take 1-2 min."
    & $pm exec playwright install chromium
    if ($LASTEXITCODE -ne 0) {
        Warn "Playwright Chromium install failed (exit $LASTEXITCODE)."
        Warn "Rank-checking + SERP scanning tools won't work until this succeeds."
        Warn "To retry later:  cd '$dir'; pnpm exec playwright install chromium"
    } else {
        Say "Playwright Chromium installed."
    }

    # ============================================================
    # DATABASE MIGRATIONS - capture full stderr so failures are visible
    # ============================================================
    Say "Applying database migrations"
    # `2>&1` merges stderr into stdout so transcript captures it.
    # Without this, migration errors silently vanish from the log.
    & node scripts/migrate.cjs 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) {
        DieMulti @(
            "Database migrations failed (exit $LASTEXITCODE).",
            "",
            "The most common cause is a corrupted or partially-built better-sqlite3.",
            "If you see 'Could not locate the bindings file' above, run:",
            "  cd $dir",
            "  pnpm rebuild better-sqlite3 --verbose",
            "",
            "If you see 'SQLITE_CORRUPT' or 'no such table', data.db may be damaged.",
            "Backup data.db, delete it, and re-run the installer to start fresh.",
            "",
            "Full error output is logged above and in: $logPath"
        )
    }

    if (-not (Test-Path ".env.local")) {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env.local"
        }
    }

    # Build once now so daily startup runs in production mode - ~10x
    # faster page loads and roughly half the RAM of `next dev`.
    Say "Building production bundle (one-time, ~1-2 min). Skips JIT compile every navigation."
    & $pm run build
    if ($LASTEXITCODE -ne 0) {
        Warn "Production build failed - falling back to dev mode for daily startup."
        Warn "You can retry later with: $pm run build"
        $script:buildOk = $false
    } else {
        $script:buildOk = $true
    }

    Say "Starting server on port $port (background)"
    $logFile = Join-Path $dir "dev-server.log"
    $errFile = Join-Path $dir "dev-server.err.log"
    $pidFile = Join-Path $dir ".dev-server.pid"
    $batFile = Join-Path $dir ".dev-server.cmd"

    # Kill any prior server we started (from a previous install run)
    if (Test-Path $pidFile) {
        $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($oldPid) {
            Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        }
    }
    # Also clear anything still bound to the port (e.g. lingering pnpm child)
    try {
        $bound = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($bound) {
            foreach ($c in $bound) {
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 1
        }
    } catch {}

    # Write a small .cmd file and launch THAT. pnpm/npm on Windows are .cmd
    # shims, so Start-Process -FilePath "pnpm" hits "%1 is not a valid Win32
    # application". A real .cmd file works around it cleanly and avoids all
    # the quote-escaping problems of `cmd /c "long command"`.
    #
    # NOTE: write with WriteAllLines (no here-string). When this script is
    # streamed through `iwr | iex` on PS 5.1, a `@"..."@` here-string here
    # has been observed to swallow the rest of the script - same root cause
    # we hit in Die / DieMulti.
    $runScript = if ($script:buildOk) { "start:daily" } else { "dev" }
    $batLines = @(
        "@echo off",
        "set PORT=$port",
        "$pm run $runScript"
    )
    [System.IO.File]::WriteAllLines($batFile, $batLines, [System.Text.Encoding]::ASCII)

    $proc = Start-Process -FilePath $batFile `
        -WorkingDirectory $dir `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $errFile `
        -PassThru -WindowStyle Hidden -ErrorAction Stop
    $proc.Id | Out-File -FilePath $pidFile -Encoding ascii

    $waitLabel = if ($script:buildOk) { "(production start, ~2-5s)" } else { "(30-90s for first dev build)" }
    Say "Waiting for the app to come up... $waitLabel"
    for ($i = 0; $i -lt 90; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$port/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { $up = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if (-not $up) {
        Warn "App didn't respond on health check."
        $shown = $false
        foreach ($f in @($logFile, $errFile)) {
            if ((Test-Path $f) -and ((Get-Item $f).Length -gt 0)) {
                Write-Host ""
                Write-Host "Last lines of $f`:" -ForegroundColor Yellow
                Get-Content $f -Tail 30 | ForEach-Object { Write-Host "  $_" }
                Write-Host ""
                $shown = $true
            }
        }
        if (-not $shown) {
            Warn "Log files are empty - the server process didn't even start."
            Warn "Run manually to see what's happening:"
            Warn "  cd '$dir'"
            Warn "  $pm run dev"
        }
    } else {
        Say "App is up at http://localhost:$port"
    }
}

# ---- 5. Desktop launcher — a single HTML file replaces the old
# Start / Stop .lnk shortcuts. The HTML control panel has Open + Start
# + Stop buttons in one window, with live status. Cleaner desktop,
# fewer files to explain, same one-click experience.
if ((Test-Path $desktop) -and (-not $hasDocker)) {
    try {
        $wshShell = New-Object -ComObject WScript.Shell
        $iconCandidates = @(
            (Join-Path $dir "public\favicon.ico"),
            (Join-Path $dir "public\icon.ico")
        )
        $iconPath = $null
        foreach ($ic in $iconCandidates) {
            if (Test-Path $ic) { $iconPath = $ic; break }
        }

        # Sweep up any old desktop files from previous installs so the
        # user ends with exactly ONE launcher (SEO Tool.html) instead of
        # 3-4 confusing files. Safe to delete — they're regenerated by
        # the installer and the HTML launcher replaces their function.
        foreach ($legacy in @(
            "Start SEO Tool.lnk",
            "Stop SEO Tool.lnk",
            "SEO Tool.lnk",
            "SEO-Tool-Welcome.txt"
        )) {
            $p = Join-Path $desktop $legacy
            if (Test-Path $p) {
                Remove-Item $p -Force -ErrorAction SilentlyContinue
            }
        }

        # Drop the HTML control panel on the desktop. Double-click opens
        # it in the user's default browser; the page has Open / Start /
        # Stop buttons with live status. Survives port changes (template
        # gets re-written on every install with the current port).
        $launcherTpl = Join-Path $dir "templates\desktop-launcher.html"
        $launcherOut = Join-Path $desktop "SEO Tool.html"
        if (Test-Path $launcherTpl) {
            try {
                $tpl = [System.IO.File]::ReadAllText($launcherTpl)
                $startCmdUri = "file:///" + ((Join-Path $dir "bin\START.cmd") -replace '\\', '/' -replace ' ', '%20')
                $stopCmdUri = "file:///" + ((Join-Path $dir "bin\STOP.cmd") -replace '\\', '/' -replace ' ', '%20')
                $rendered = $tpl.Replace('{{PORT}}', "$port").Replace('{{DIR}}', $dir).Replace('{{START_CMD}}', $startCmdUri).Replace('{{STOP_CMD}}', $stopCmdUri)
                [System.IO.File]::WriteAllText($launcherOut, $rendered, [System.Text.UTF8Encoding]::new($false))
                Say "Created desktop launcher: $launcherOut"
            } catch {
                Warn "Couldn't write SEO Tool.html launcher: $($_.Exception.Message)"
            }
        }

        # Also drop a Start Menu shortcut so Windows search ("SEO Tool"
        # -> Enter) finds the app. One extra CreateShortcut into the
        # per-user Programs folder — no admin needed.
        $startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
        if (Test-Path $startMenu) {
            $menuPath = Join-Path $startMenu "SEO Tool.lnk"
            $menuSc = $wshShell.CreateShortcut($menuPath)
            $menuSc.TargetPath = Join-Path $dir "bin\START.cmd"
            $menuSc.WorkingDirectory = $dir
            $menuSc.Description = "Start the SEO Tool (DiceCodes)"
            if ($iconPath) { $menuSc.IconLocation = $iconPath }
            $menuSc.Save()
            Say "Created Start Menu shortcut: $menuPath"
        }
    } catch {
        Warn "Couldn't create desktop shortcuts: $($_.Exception.Message)"
    }
}

# ---- 5c. Defender exclusion (opt-in via SEO_DEFENDER_EXCLUDE=1) ------------
# First start is noticeably slower because Defender real-time-scans every
# file in node_modules + the Playwright Chromium binary. Adding an
# exclusion for $dir speeds this up dramatically. Requires admin elevation
# (Add-MpPreference), so we only run it when the user opts in AND we're
# already running elevated. Otherwise print the one-liner so they can run
# it themselves in an admin shell.
if (-not $hasDocker -and $env:SEO_DEFENDER_EXCLUDE -eq "1") {
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($isAdmin) {
        try {
            Add-MpPreference -ExclusionPath $dir -ErrorAction Stop
            Say "Added Defender exclusion: $dir (faster first start)"
        } catch {
            Warn "Could not add Defender exclusion: $($_.Exception.Message)"
        }
    } else {
        Info "SEO_DEFENDER_EXCLUDE=1 set but installer is not elevated."
        Info "Run this once in an Administrator PowerShell to skip Defender scans:"
        Info "  Add-MpPreference -ExclusionPath '$dir'"
    }
}

# ---- 5b. Auto-start at login (opt-in via SEO_AUTOSTART=1) -------------------
# Registers a per-user scheduled task that runs START.cmd at logon. No admin
# rights needed; safe for any standard user account. Skip on Docker (Docker
# Desktop handles container auto-restart via its own settings).
if (-not $hasDocker -and $env:SEO_AUTOSTART -eq "1") {
    try {
        $taskName = "SEO Tool - Start at login"
        $startCmd = Join-Path $dir "bin\START.cmd"
        if (Test-Path $startCmd) {
            # Remove any existing task by the same name so re-install replaces it
            try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
            $action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$startCmd`"" -WorkingDirectory $dir
            $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
            $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -Hidden
            Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts the SEO Tool dev server at user logon." | Out-Null
            Say "Registered auto-start task: $taskName"
        } else {
            Warn "SEO_AUTOSTART set but $startCmd not found - skipped"
        }
    } catch {
        Warn "Could not register auto-start task: $($_.Exception.Message)"
    }
}

# ---- 6. Desktop welcome file (Docker installs ONLY).
# Native installs get SEO Tool.html — a far better control panel with
# live status + Open / Start / Stop buttons. Docker users don't get
# the HTML launcher (Docker handles its own lifecycle), so they still
# benefit from a plain-text welcome with the docker compose commands.
$welcome = Join-Path $desktop "SEO-Tool-Welcome.txt"
if ((Test-Path $desktop) -and $hasDocker) {
    $controls = if ($hasDocker) {
@"
Start:    cd "$dir"; `$env:SEO_HOST_PORT='$port'; docker compose up -d
Stop:     cd "$dir"; docker compose down
Restart:  cd "$dir"; docker compose restart
Logs:     cd "$dir"; docker compose logs -f
Status:   cd "$dir"; docker compose ps
Update:   Re-run the installer command (one-liner from README)
Backup:   Settings -> Backup & restore -> Download backup
"@
    } else {
@"
Start:    Double-click "Start SEO Tool" shortcut on your Desktop
          (or run: $dir\bin\START.cmd)
Stop:     Double-click "Stop SEO Tool" shortcut on your Desktop
          (or run: $dir\bin\STOP.cmd)
          (or in app: profile menu -> System health -> Shutdown)
Restart:  In the app -> profile menu -> Restart server (top-right power icon)
Logs:     Get-Content "$dir\dev-server.log" -Wait -Tail 100
Update:   Re-run the installer command (one-liner from README)
Backup:   Settings -> Backup & restore -> Download backup
"@
    }

    $folderLayout = if ($hasDocker) {
@"
$dir\
  docker-compose.yml          <- service definition
  Dockerfile                  <- image build
  data.db                     <- (lives in /data inside the named volume "seo-data")
"@
    } else {
@"
$dir\
  bin\                        <- launcher scripts (START.cmd, STOP.cmd)
    START.cmd                 <- DOUBLE-CLICK to start the server
    STOP.cmd                  <- DOUBLE-CLICK to stop the server
  data.db                     <- your SQLite database (clients, keywords, audits, reports - back this up)
  .seo-encryption-key         <- AES key that decrypts your API keys (back this up too)
  .env.local                  <- env config (APP_PASSWORD, custom env vars)
  dev-server.log              <- runtime log (tail this for errors)
  .dev-server.pid             <- PID of the running server
  screenshots\                <- SERP screenshots from rank checks
  data\screenshots\           <- same, when run via Docker
  README.md                   <- full feature list + install + license
  TROUBLESHOOTING.md          <- 12-section support doc
  docs\HOSTING.md             <- production hosting guides (Hetzner, Railway, etc)
  ROADMAP.md                  <- what's coming next
  wordpress-plugin\           <- companion WordPress plugin (.zip and install)
"@
    }

    $content = @"
======================================================
   SEO TOOL - INSTALLED SUCCESSFULLY
   Built by DiceCodes (https://dicecodes.com)
======================================================

Open the app:        http://localhost:$port
Install location:    $dir

You can find this guide on your Desktop any time.

----------------------- FIRST 5 MIN ------------------
1. Open http://localhost:$port
2. Add a client at /clients/new (paste any domain - it'll
   auto-detect the tech stack and niche)
3. Pick an AI provider at /settings:
     - Local Ollama (free, private, fully offline)  OR
     - Gemini / Groq / OpenRouter / DeepSeek (free tiers, paste key)  OR
     - OpenAI / Anthropic (paid, BYO key)
4. Run your first audit
5. Tomorrow: the daily AI agent kicks in automatically and runs ~17
   automated jobs per client (rank checks, audit deltas, content
   decay, backlink scans, GBP monitoring, alerts).

----------------------- WHERE EVERYTHING LIVES -------
$folderLayout

----------------------- CONTROLS ---------------------
$controls

----------------------- TROUBLESHOOT -----------------
Blank page?       Server still building - wait 30-60s and refresh.
Port conflict?    The installer auto-tries 3001-3010, 8080-81, 4000, 5000.
                  If it picked a different port than 3000, this guide shows it
                  at the top. To force a port: `$env:SEO_PORT='4000' before
                  re-running the installer.
Want a password?  Set APP_PASSWORD=yourpassword in $dir\.env.local then restart.
LAN access?       Default binds to 127.0.0.1 only. To expose on your LAN,
                  set APP_PASSWORD (required) AND SEO_BIND_HOST=0.0.0.0
                  in $dir\.env.local, then restart.
Backup/Restore?   Settings -> Backup & restore in the app.
Forgot password?  Edit $dir\.env.local, remove the APP_PASSWORD line, restart.
Full guide:       $dir\TROUBLESHOOTING.md (12 sections, covers most issues)

----------------------- DAILY USE --------------------
The fastest way to launch every day:
   Double-click the "Start SEO Tool" shortcut on your desktop.
   When you're done, double-click "Stop SEO Tool" to shut it down.

The app auto-opens in your browser. If the port is already serving
(you opened it earlier), the launcher just opens a new tab.

Your data NEVER leaves this machine. No telemetry. No phone-home.
The only outbound network calls are:
   - Google's free APIs (GSC, GA4, PageSpeed) - only when you connect them
   - Your chosen AI provider (only when you run AI features)
   - SERP scraping via headless browser (only when you check rankings)

----------------------- HELP -------------------------
Repo + issues:    https://github.com/IamRamgarhia/SEO-Tool
Troubleshooting:  $dir\TROUBLESHOOTING.md
Hosting guides:   $dir\docs\HOSTING.md
README:           $dir\README.md
Email support:    Contact@dicecodes.com

----------------------- SUPPORT THIS PROJECT ---------
This tool is free and self-hosted. If it saves you the cost of
an Ahrefs or Semrush subscription:
   - Star the repo (huge impact, zero cost):
     https://github.com/IamRamgarhia/SEO-Tool
   - UPI (India): princeramgarhiaa-1@okaxis
     (Open the app -> click the Support button for QR + presets)
   - PayPal (international):
     https://www.paypal.com/donate/?business=princeramgarhiaa@gmail.com

======================================================
"@
    $content | Out-File -FilePath $welcome -Encoding utf8
    Say "Created Desktop guide: $welcome"
}

# ---- 7. auto-open browser ---------------------------------------------------
$url = "http://localhost:$port"
if ($up) {
    Say "Opening browser"
    Start-Process $url
}

Write-Host ""
Write-Host "SEO Tool ready." -ForegroundColor Green
Write-Host ""
Write-Host "Open:    $url"
if (Test-Path $welcome) { Write-Host "Guide:   $welcome" }
Write-Host ""

# Stop transcript + save log copies + pause so the window doesn't auto-close
Save-LogAndExit $false
