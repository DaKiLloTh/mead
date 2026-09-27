#!/usr/bin/env bash
# Builds mead for Linux inside the mead-linux-build image. Run from the repo
# root (the image's WORKDIR is /repo, where the README's docker run command
# mounts the source). The target architecture is the container's own, so a
# linux/arm64 container produces an arm64 binary and linux/amd64 an amd64 one.
set -euo pipefail

case "$(uname -m)" in
  x86_64) GOARCH=amd64 ;;
  aarch64 | arm64) GOARCH=arm64 ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# main.go embeds frontend/dist, which is gitignored build output and must
# exist before Go can compile (or `wails generate module` can introspect).
mkdir -p frontend/dist
touch frontend/dist/.placeholder

# Generated Go<->TS bindings, gitignored.
wails generate module

# A fresh install inside the container: a node_modules copied from macOS
# holds macOS-native binaries (esbuild, rollup) that cannot run on Linux.
(cd frontend && npm ci)

# -tags webkit2_41: Wails v2.15.0 links against webkit2gtk-4.0 unless this
# tag is set, and Ubuntu 22.04's libwebkit2gtk-4.1-dev does not provide the
# 4.0 pkg-config file. Without the tag the build fails with "Package
# webkit2gtk-4.0 was not found in the pkg-config search path".
wails build -platform "linux/${GOARCH}" -tags webkit2_41 -clean

file build/bin/mead
