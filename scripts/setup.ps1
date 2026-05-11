# Native-install bootstrap for Windows. Run from the repo root.
#   ./scripts/setup.ps1
#
# What this does:
#   1. Pick a package manager (pnpm > npm)
#   2. Install Node dependencies
#   3. Download the Playwright Chromium binary
#   4. Apply DB migrations (creates .\data.db on first run)
#   5. Create .env.local from the template if it doesn't exist
#
# Safe to re-run — each step skips itself when already done.

$ErrorActionPreference = "Stop"

function Say($msg)  { Write-Host "-> $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "!  $msg" -ForegroundColor Yellow }
function Die($msg)  { Write-Host "X  $msg" -ForegroundColor Red; exit 1 }

# ---- 0. preflight -----------------------------------------------------------
Say "Checking prerequisites"
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Die "Node.js not found. Install Node 20+ from https://nodejs.org" }
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) {
    Die "Node $nodeMajor detected — this project needs Node 20+. Upgrade at https://nodejs.org"
}
Say "Node $(node -v) ok"

# ---- 1. pick package manager -----------------------------------------------
$pm = $null
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    $pm = "pnpm"
}
elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    Warn "pnpm not found — falling back to npm (slower install). Install pnpm with: npm i -g pnpm"
    $pm = "npm"
}
else {
    Die "No package manager found. Install Node from https://nodejs.org (ships with npm)"
}
Say "Using $pm"

# ---- 2. install dependencies ------------------------------------------------
if (-not (Test-Path "node_modules")) {
    Say "Installing dependencies (this takes 1-3 minutes the first time)"
    & $pm install
    if ($LASTEXITCODE -ne 0) { Die "Dependency install failed" }
}
else {
    Say "Dependencies already installed (skipping). Delete node_modules to force reinstall."
}

# ---- 3. Playwright Chromium -------------------------------------------------
$chromiumDir = Join-Path $env:USERPROFILE "AppData\Local\ms-playwright"
$alreadyHave = $false
if (Test-Path $chromiumDir) {
    $hasFiles = (Get-ChildItem -Path $chromiumDir -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
    if ($hasFiles) { $alreadyHave = $true }
}
if (-not $alreadyHave) {
    Say "Downloading Playwright Chromium (~170 MB, one-time)"
    & $pm exec playwright install chromium
}
else {
    Say "Playwright Chromium already installed (skipping)"
}

# ---- 4. migrations ----------------------------------------------------------
Say "Applying database migrations"
node scripts/migrate.cjs
if ($LASTEXITCODE -ne 0) { Die "Migrations failed" }

# ---- 4b. icons --------------------------------------------------------------
if (Test-Path "scripts/gen-icons.mjs") {
    $iconStat = Get-Item "public/icon-192.png" -ErrorAction SilentlyContinue
    # Regenerate if missing or if the placeholder (<200B) is still in place
    if (-not $iconStat -or $iconStat.Length -lt 200) {
        Say "Generating app icons (PNG + ICO + favicon)"
        node scripts/gen-icons.mjs
        if ($LASTEXITCODE -ne 0) { Warn "Icon generation failed — manifest will still render the SVG icon" }
    }
    else {
        Say "Icons already generated (skipping)"
    }
}

# ---- 4c. encryption key -----------------------------------------------------
# Generate a 256-bit AES key for encrypting AI/Google/WP credentials at rest.
# Stored alongside data.db; back BOTH up together. See src/lib/crypto.ts.
if (-not (Test-Path ".seo-encryption-key")) {
    Say "Generating encryption key for at-rest credential storage"
    node -e "const c=require('node:crypto'); const fs=require('node:fs'); fs.writeFileSync('.seo-encryption-key', c.randomBytes(32).toString('base64'), { mode: 0o600 });"
    if ($LASTEXITCODE -ne 0) { Warn "Could not generate encryption key — credentials will be stored unencrypted until this is fixed" }
}
else {
    Say "Encryption key already exists (skipping)"
}

# ---- 5. .env.local ---------------------------------------------------------
if (-not (Test-Path ".env.local")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env.local"
        Say "Created .env.local from .env.example"
    }
    else {
        New-Item -Path ".env.local" -ItemType File -Force | Out-Null
        Say "Created empty .env.local"
    }
}
else {
    Say ".env.local already exists (skipping)"
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Start the dev server:"
Write-Host "  $pm dev"
Write-Host ""
Write-Host "Then open http://localhost:3000"
Write-Host ""
Write-Host "Optional next steps:"
Write-Host "  - Edit .env.local to set Google OAuth or AI provider keys"
Write-Host "  - Add a client at http://localhost:3000/clients/new"
Write-Host "  - Pick an AI provider at http://localhost:3000/settings"
