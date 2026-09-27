#!/usr/bin/env bash
# Starts the Linux build of mead under a virtual display and a window
# manager, checks the process is still alive after a few seconds, and saves
# a screenshot. Run from the repo root inside the mead-linux-build image,
# after build.sh. Exits non-zero if mead is not running after the wait.
set -uo pipefail

OUT="${1:-build/bin/screenshot.png}"

Xvfb :99 -screen 0 1280x900x24 >/dev/null 2>&1 &
sleep 2
export DISPLAY=:99

# Xvfb alone never draws window decorations. fluxbox draws a normal native
# title bar, which is what a real desktop does for mead's window.
fluxbox >/dev/null 2>&1 &
sleep 2

./build/bin/mead >/tmp/mead.log 2>&1 &
MEAD_PID=$!
sleep 6

STATUS=0
if kill -0 "$MEAD_PID" 2>/dev/null; then
  echo "mead (pid $MEAD_PID) is still running after 6s"
else
  echo "mead exited early" >&2
  STATUS=1
fi

echo "--- mead output ---"
cat /tmp/mead.log

import -window root "$OUT" && echo "screenshot saved to $OUT"

kill "$MEAD_PID" 2>/dev/null || true
exit "$STATUS"
