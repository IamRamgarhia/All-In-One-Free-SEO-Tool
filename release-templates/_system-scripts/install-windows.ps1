# Set the app up, then open it. Run again any time — it is idempotent.
#
# This does not reimplement the install. bin/START.cmd already handles
# dependency install, migrations, the production build, port selection,
# binding to 127.0.0.1 and waiting for health, and it is the path CI
# exercises. This script's only jobs are to make sure Node exists first
# and to keep the window open long enough to read if something fails.

$ErrorActionPreference = 'Stop'
$SystemDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ensure-node.ps1')

Write-Host ''
Write-Host '  ============================================'
Write-Host '    SEO Tool - setting up'
Write-Host '  ============================================'
Write-Host ''
Write-Host "  Folder: $SystemDir"
Write-Host ''

if (-not (Ensure-Node -SystemDir $SystemDir)) {
  Write-Host ''
  Read-Host '  Press Enter to close'
  exit 1
}

$start = Join-Path $SystemDir 'bin\START.cmd'
if (-not (Test-Path $start)) {
  Write-Host "  Missing $start - the download looks incomplete." -ForegroundColor Red
  Read-Host '  Press Enter to close'
  exit 1
}

Write-Host ''
Write-Host '  Installing and building. First run takes a few minutes -'
Write-Host '  it fetches dependencies and compiles the app. Later runs'
Write-Host '  start in seconds.'
Write-Host ''

# The first run of a Next app is heavy: hundreds of MB of dependencies
# and a full production build. Saying so is kinder than a silent window.
& cmd /c "`"$start`""
$code = $LASTEXITCODE

if ($code -ne 0) {
  Write-Host ''
  Write-Host "  Setup stopped with exit code $code." -ForegroundColor Red
  Write-Host '  The lines above say why. Most often it is no internet, or'
  Write-Host '  antivirus holding a file while npm writes it.'
  Read-Host '  Press Enter to close'
  exit $code
}

exit 0
