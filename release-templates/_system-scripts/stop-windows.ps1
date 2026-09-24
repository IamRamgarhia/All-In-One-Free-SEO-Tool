# Stop the app. Reuses bin/STOP.cmd, which owns pid tracking.

$SystemDir = Split-Path -Parent $PSScriptRoot
$stop = Join-Path $SystemDir 'bin\STOP.cmd'
if (-not (Test-Path $stop)) {
  Write-Host '  Nothing to stop - bin\STOP.cmd is missing.'
  Read-Host '  Press Enter to close'
  exit 1
}
& cmd /c "`"$stop`""
