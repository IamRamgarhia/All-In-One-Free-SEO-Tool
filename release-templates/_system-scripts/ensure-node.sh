#!/usr/bin/env bash
# Make sure Node.js exists, without sending anyone to nodejs.org.
#
# Same reasoning as ensure-node.ps1: "install something else first, then
# come back" is where a non-technical person stops. The official
# portable tarball needs no sudo — unpack it inside this folder and put
# it at the front of PATH for this shell only. A Node the person already
# has is left alone.
#
# Source it:  . "$SYSTEM_SCRIPTS/ensure-node.sh" && ensure_node || exit 1

NODE_VERSION="v22.11.0"

ensure_node() {
  local system_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  local node_dir="$system_dir/node"

  # A portable copy from a previous run wins, so the app keeps working
  # even if the person later removes their own Node.
  if [ -x "$node_dir/bin/node" ]; then
    export PATH="$node_dir/bin:$PATH"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    local major minor raw
    raw="$(node --version 2>/dev/null)"
    major="$(printf '%s' "$raw" | sed -n 's/^v\([0-9]*\)\..*/\1/p')"
    minor="$(printf '%s' "$raw" | sed -n 's/^v[0-9]*\.\([0-9]*\).*/\1/p')"
    if [ -n "$major" ] && { [ "$major" -gt 20 ] || { [ "$major" -eq 20 ] && [ "$minor" -ge 11 ]; }; }; then
      return 0
    fi
    echo "  Node $raw is installed, but this needs 20.11 or newer."
    echo "  Fetching a private copy — your own Node is left alone."
  else
    echo "  Node.js is not on this computer. Fetching it (about 30 MB, one time)."
  fi

  local os arch name url tmp
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *) echo "  Unsupported system: $(uname -s)"; return 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) echo "  Unsupported processor: $(uname -m)"; return 1 ;;
  esac

  name="node-$NODE_VERSION-$os-$arch"
  url="https://nodejs.org/dist/$NODE_VERSION/$name.tar.gz"
  tmp="$(mktemp -d 2>/dev/null || mktemp -d -t seonode)"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tmp/node.tar.gz" || { echo "  Download failed."; rm -rf "$tmp"; return 1; }
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$tmp/node.tar.gz" || { echo "  Download failed."; rm -rf "$tmp"; return 1; }
  else
    echo "  Neither curl nor wget is available, so Node cannot be fetched."
    echo "  Install Node.js 20.11+ from https://nodejs.org and run this again."
    rm -rf "$tmp"; return 1
  fi

  echo "  Unpacking..."
  tar -xzf "$tmp/node.tar.gz" -C "$tmp" || { echo "  Could not unpack Node."; rm -rf "$tmp"; return 1; }
  rm -rf "$node_dir"
  mv "$tmp/$name" "$node_dir" || { echo "  Could not move Node into place."; rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"

  # Never carry on assuming the download worked — that is what produces
  # "npm: command not found" three steps later, which explains nothing.
  if [ ! -x "$node_dir/bin/node" ]; then
    echo "  The download finished but node is not where it should be."
    return 1
  fi
  export PATH="$node_dir/bin:$PATH"
  echo "  Node $(node --version) is ready (kept inside this folder)."
  return 0
}
