#!/bin/sh
# Builds the menu bar companion (cmd/mead-mon) as its own helper app inside
# mead's bundle, at mead.app/Contents/Library/LoginItems/mead-mon.app, where
# internal/menubar looks for it.
#
# It needs its own .app with its own Info.plist. Run loose from mead's
# Contents/MacOS, macOS gives it mead's identity: a Dock tile, a second
# "mead" in Activity Monitor, and `open -a mead` finding it instead of
# launching mead.
#
# Usage: scripts/bundle-menubar.sh path/to/mead.app <goarch> <version>
set -eu

app=$1
arch=$2
version=$3

helper="$app/Contents/Library/LoginItems/mead-mon.app"
rm -rf "$helper"
mkdir -p "$helper/Contents/MacOS"
sed "s/{{VERSION}}/$version/g" cmd/mead-mon/Info.plist > "$helper/Contents/Info.plist"
plutil -lint "$helper/Contents/Info.plist" >/dev/null
CGO_ENABLED=1 GOARCH="$arch" go build -ldflags "-s -w" -o "$helper/Contents/MacOS/mead-mon" ./cmd/mead-mon
