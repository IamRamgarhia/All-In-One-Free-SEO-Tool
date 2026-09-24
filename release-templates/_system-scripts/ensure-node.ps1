# Make sure Node.js exists, without asking anyone to go and get it.
#
# WHY THIS EXISTS
#
# The launcher used to check for Node, find nothing, and tell the person
# to visit nodejs.org, install it, and come back. That is the point where
# a non-technical user stops. They came here to look at their SEO, not to
# learn what a JavaScript runtime is, and "go and install something else
# first" reads as "this is not for you".
#
# The official portable ZIP needs no rights at all: unpack it next to the
# app and put it at the front of PATH for this process only. Nothing is
# written outside this folder, no UAC prompt appears, nothing is added to
# the system PATH, and a Node the person already has is left completely
# alone.
#
# Dot-source this from any script that needs Node:
#   . "$PSScriptRoot\ensure-node.ps1"
#   if (-not (Ensure-Node)) { exit 1 }

# Next 16 needs 20.11; this is the current LTS at time of writing and is
# what CI builds against.
$Script:NodeVersion = 'v22.11.0'

function Ensure-Node {
  param([string]$SystemDir = (Split-Path -Parent $PSScriptRoot))

  $nodeDir = Join-Path $SystemDir 'node'
  $nodeExe = Join-Path $nodeDir 'node.exe'

  # A portable copy from a previous run wins, so the app keeps working
  # even if the person later uninstalls their own Node.
  if (Test-Path $nodeExe) {
    $env:Path = "$nodeDir;$env:Path"
    return $true
  }

  $existing = Get-Command node -ErrorAction SilentlyContinue
  if ($existing) {
    # Present, but old enough to fail in confusing ways later. Better to
    # fetch our own than to let `next build` die on syntax it cannot parse.
    $raw = (& node --version) 2>$null
    if ($raw -match 'v(\d+)\.(\d+)') {
      $major = [int]$Matches[1]; $minor = [int]$Matches[2]
      if ($major -gt 20 -or ($major -eq 20 -and $minor -ge 11)) { return $true }
      Write-Host "  Node $raw is installed, but this needs 20.11 or newer."
      Write-Host '  Fetching a private copy - your own Node is left alone.'
    } else {
      return $true
    }
  } else {
    Write-Host '  Node.js is not on this PC. Fetching it (about 30 MB, one time).'
  }

  $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'x86' }
  $name = "node-$($Script:NodeVersion)-win-$arch"
  $tmpZip = Join-Path $env:TEMP "$name.zip"
  $tmpDir = Join-Path $env:TEMP "seo-node-$([Guid]::NewGuid().ToString('N'))"

  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$($Script:NodeVersion)/$name.zip" `
      -OutFile $tmpZip -UseBasicParsing
    Write-Host '  Unpacking...'
    Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
    if (Test-Path $nodeDir) {
      Remove-Item $nodeDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Move-Item (Join-Path $tmpDir $name) $nodeDir
    Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    $env:Path = "$nodeDir;$env:Path"
  } catch {
    Write-Host ''
    Write-Host "  Could not download Node.js: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '  Check the internet connection and try again, or install Node.js'
    Write-Host '  yourself from https://nodejs.org (pick LTS) and run this again.'
    return $false
  }

  # Never carry on assuming the download worked. Marching straight to
  # `npm install` after a failed fetch is what produces "npm is not
  # recognized", which tells the person nothing about what went wrong.
  if (-not (Test-Path $nodeExe)) {
    Write-Host '  The download finished but node.exe is not where it should be.' -ForegroundColor Red
    return $false
  }

  $check = (& $nodeExe --version) 2>$null
  if (-not $check) {
    Write-Host '  Node was unpacked but will not run on this machine.' -ForegroundColor Red
    return $false
  }
  Write-Host "  Node $check is ready (kept inside this folder)."
  return $true
}
