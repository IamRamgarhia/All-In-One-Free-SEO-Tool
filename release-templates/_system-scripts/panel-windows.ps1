# Open the control panel — the one screen with every button on it.
#
# Node is guaranteed here rather than assumed: the panel is a Node
# script, and the whole point of the launcher is that the person never
# has to install anything themselves.

$ErrorActionPreference = 'Stop'
$SystemDir = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ensure-node.ps1')

if (-not (Ensure-Node -SystemDir $SystemDir)) {
  Read-Host '  Press Enter to close'
  exit 1
}

Set-Location $SystemDir
Write-Host ''
Write-Host '  Opening the SEO Tool control panel in your browser.'
Write-Host '  Keep this window open - closing it closes the panel.'
Write-Host ''
& node (Join-Path $SystemDir 'scripts\control-panel.mjs')
if ($LASTEXITCODE -ne 0) { Read-Host '  Press Enter to close' }
