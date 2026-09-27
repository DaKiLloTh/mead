# Linux build environment

Builds and smoke-tests mead for Linux without a Linux machine. Part of
[#105](https://github.com/DaKiLloTh/mead/issues/105), following
[docs/cross-platform-architecture.md](../../docs/cross-platform-architecture.md).

A Wails Linux build is cgo against the real GTK3 and webkit2gtk C libraries,
so it has to run on Linux. It cannot be cross-compiled from macOS. This image
provides that as a container instead of a VM.

Contents: Ubuntu 22.04, `build-essential`, `pkg-config`, `libgtk-3-dev`,
`libwebkit2gtk-4.1-dev`, Go, Node 22 and the Wails CLI (the same version
`.github/workflows/ci.yml` pins). `xvfb`, `fluxbox` and ImageMagick are
included so the built binary can be started and screenshotted headlessly.

## Build the image

Native on Apple Silicon, no emulation:

```sh
docker build --platform linux/arm64 -t mead-linux-build:arm64 -f docker/linux-build/Dockerfile .
```

amd64, the architecture of GitHub Actions' `ubuntu-latest` runners (runs
under QEMU on an Apple Silicon Mac, so it is slower):

```sh
docker build --platform linux/amd64 -t mead-linux-build:amd64 -f docker/linux-build/Dockerfile .
```

## Build mead

Use a copy of the repo, not your working tree. `build.sh` runs `npm ci` and
`wails generate module` inside the container, and a bind mount would write
Linux `node_modules` binaries and regenerated bindings into your macOS
checkout.

```sh
rsync -a --exclude .git --exclude frontend/node_modules --exclude frontend/wailsjs \
  --exclude frontend/dist --exclude build/bin ./ /tmp/mead-linux-src/

docker run --rm --platform linux/arm64 -v /tmp/mead-linux-src:/repo \
  mead-linux-build:arm64 bash docker/linux-build/build.sh
```

The binary is `/tmp/mead-linux-src/build/bin/mead`. `file` on it should say
`ELF 64-bit LSB executable`, not `Mach-O`.

Use `--platform linux/amd64` and the `:amd64` tag for an x86-64 binary.

### Why `-tags webkit2_41`

Wails v2.15.0 links against `webkit2gtk-4.0` unless built with the
`webkit2_41` tag. Ubuntu 22.04's `libwebkit2gtk-4.1-dev` ships only the 4.1
pkg-config file, so a plain `wails build` fails with `Package webkit2gtk-4.0
was not found`. `build.sh` and the CI job both pass the tag.

## Check that it starts

```sh
docker run --rm --platform linux/arm64 -v /tmp/mead-linux-src:/repo \
  mead-linux-build:arm64 bash docker/linux-build/check-boot.sh
```

This starts Xvfb and fluxbox, launches the binary, confirms it is still
running after 6 seconds and saves `build/bin/screenshot.png`. The script
exits non-zero if mead exited early.

## Clean up

```sh
docker rmi mead-linux-build:arm64 mead-linux-build:amd64
docker builder prune
```
