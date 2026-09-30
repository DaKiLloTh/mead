# Linux build environment for mead (milestone 1 of issue #105, see
# docs/cross-platform-architecture.md). Wails' Linux build links against
# real GTK3/webkit2gtk C libraries via cgo, so it has to actually run on
# Linux -- cross-compiling from macOS isn't an option. This image gives you
# that, without needing a persistent Linux VM.
#
# Base: ubuntu:22.04, an LTS Wails explicitly documents support for.
#
# Build (native arch, fast, no QEMU -- Apple Silicon):
#   docker build --platform linux/arm64 -t mead-linux-build:arm64 -f docker/linux-build/Dockerfile .
#
# Build (matches GitHub Actions' ubuntu-latest runners, for a real release artifact):
#   docker build --platform linux/amd64 -t mead-linux-build:amd64 -f docker/linux-build/Dockerfile .
#
# See docker/linux-build/README.md for how to actually run a build and the
# repo root's own mead source through this image.
FROM ubuntu:22.04

# Populated automatically by BuildKit from the --platform flag above --
# nothing to pass by hand. Used below to pick the right Go release tarball
# for whichever architecture this image is being built for (arm64 on this
# Mac for fast local iteration, amd64 to match CI/release runners).
ARG TARGETARCH

# go.mod's `go 1.27.0` line is this repo's source of truth for the Go
# version; kept in sync by hand here since a Dockerfile can't read go.mod.
ARG GO_VERSION=1.27.1
ARG NODE_MAJOR=22
# Matches .github/workflows/ci.yml's own pinned Wails CLI version exactly --
# do not introduce a second pin that can drift from it.
ARG WAILS_VERSION=2.15.0

ENV DEBIAN_FRONTEND=noninteractive

# build-essential/pkg-config: cgo needs a real C toolchain and pkg-config to
# find the GTK/webkit2gtk headers below.
#
# libgtk-3-dev + libwebkit2gtk-4.1-dev: Wails' Linux backend is GTK3 +
# WebKitGTK. 4.1, not 4.0 -- confirmed by actually running this Dockerfile:
# ubuntu:22.04's default repos don't carry libwebkit2gtk-4.0-dev at all
# (Wails' own GitHub issues warn it's inconsistent even where it exists on
# newer distros); 4.1 installs cleanly.
#
# xvfb + imagemagick: not needed to build mead, only to run and screenshot
# it headlessly inside this same container afterwards (see README.md) --
# kept in the same image rather than a second one so "build it, then check
# it actually starts" doesn't need two images.
#
# fluxbox: a plain X server (Xvfb alone) never draws window decorations at
# all -- every window, GTK or not, just sits undecorated at its own
# coordinates with no border or title bar, regardless of what a real
# desktop's window manager would draw. Confirming mead gets an ordinary
# native Linux title bar (not a bare floating pane) needs some window
# manager actually running to draw one; fluxbox is a minimal, fast-starting
# one good enough for that one screenshot, not a statement about what
# desktop environment mead targets.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    ca-certificates \
    curl \
    git \
    xvfb \
    fluxbox \
    imagemagick \
    file \
    && rm -rf /var/lib/apt/lists/*

# Go, installed from the official tarball rather than an apt package --
# Ubuntu 22.04's own golang-go package is years behind go.mod's 1.27.0.
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" -o /tmp/go.tar.gz \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"
ENV GOPATH="/root/go"

# Node 22, matching .github/workflows/ci.yml's actions/setup-node version --
# Nodesource's setup script is the standard way to get a current Node onto
# an LTS Ubuntu whose own apt repo only carries an old one.
RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Same Wails CLI version this repo's CI pins in .github/workflows/ci.yml --
# see WAILS_VERSION above, not a second independent pin.
RUN go install "github.com/wailsapp/wails/v2/cmd/wails@v${WAILS_VERSION}"

WORKDIR /repo
