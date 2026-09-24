#!/usr/bin/env bash
# Double-click this file. That is the whole thing.
#
# It finds the _system folder next to it, makes sure Node exists
# (fetching a private copy if this computer has none), sets the app up the
# first time, and opens the control panel in your browser.
cd "$(dirname "$0")" || exit 1
exec bash "./_system/_system-scripts/launch-unix.sh"
