# One-line installer for Windows. Run via:
#   iwr -useb https://raw.githubusercontent.com/IamRamgarhia/seo/main/install.ps1 | iex
#
# Detects Docker Desktop. If present, uses Docker. Otherwise falls back to
# native Node install via scripts/setup.ps1.
#
# Idempotent. Safe to re-run for upgrades.

$ErrorActionPreference = "Stop"
$repo = "https://github.com/IamRamgarhia/seo.git"
$dir = if ($env:SEO_INSTALL_DIR) { $env:SEO_INSTALL_DIR } else { Join-Path $HOME "seo" }

function Say($m)  { Write-Host "-> $m" -ForegroundColor Green }
function Warn($m) { Write-Host "!  $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "X  $m" -ForegroundColor Red; exit 1 }

Say "SEO Tool installer"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git not found. Install git from https://git-scm.com/downloads"
}

# ---- clone or pull -----------------------------------------------------------
if (Test-Path (Join-Path $dir ".git")) {
    Say "Existing install at $dir — pulling latest"
    Push-Location $dir
    try { git pull --ff-only } catch { Warn "git pull failed; continuing" }
    Pop-Location
}
else {
    Say "Cloning into $dir"
    git clone --depth 1 $repo $dir
}
Set-Location $dir

# ---- pick install method ----------------------------------------------------
$hasDocker = $false
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
    try {
        docker info | Out-Null
        if ($LASTEXITCODE -eq 0) { $hasDocker = $true }
    } catch { $hasDocker = $false }
}

if ($hasDocker) {
    Say "Docker detected — using Docker install path"
    try {
        docker compose version | Out-Null
        if ($LASTEXITCODE -ne 0) { Die "Docker is installed but 'docker compose' (v2) is not. Update Docker Desktop." }
    } catch { Die "Docker compose v2 not found." }
    Say "Building + starting container (first run takes ~3-5 minutes)"
    docker compose up -d --build
    Say "Waiting for the app to come up..."
    for ($i = 0; $i -lt 12; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3000/api/v1/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { break }
        } catch {}
        Start-Sleep -Seconds 2
    }
    Write-Host ""
    Write-Host "SEO Tool is running." -ForegroundColor Green
    Write-Host ""
    Write-Host "Open:    http://localhost:3000"
    Write-Host "Stop:    cd $dir; docker compose down"
    Write-Host "Update:  cd $dir; git pull; docker compose up -d --build"
    Write-Host "Logs:    cd $dir; docker compose logs -f"
}
else {
    Warn "Docker not detected - falling back to native install"
    Warn "Install Docker Desktop for the easiest setup: https://www.docker.com/products/docker-desktop/"
    Write-Host ""
    & (Join-Path $dir "scripts/setup.ps1")
    Write-Host ""
    Write-Host "Setup complete." -ForegroundColor Green
    Write-Host ""
    Write-Host "Start the dev server:"
    Write-Host "  cd $dir; pnpm dev   # or: npm run dev"
    Write-Host ""
    Write-Host "Then open http://localhost:3000"
}
