# mead

A native Homebrew GUI for macOS, built with Go + [Wails](https://wails.io) + React.

## Features

- **Dashboard** — installed/outdated counts, a health tile (deprecated/disabled/pinned), one-click update/upgrade-all/doctor
- **Installed** — browse formulae + casks, filter by type/outdated/favorites, bulk multi-select actions, per-row pin/upgrade/uninstall
- **Search** — live `brew search` across formulae and casks, install inline
- **Collections** — curated package bundles (Web Dev, DevOps, Data Science, …) installable in one click
- **Updates** — per-item or bulk upgrade, snooze updates for a day/week/month
- **Taps** / **Services** — add/remove taps, start/stop/restart `brew services`
- **Adopt Existing Apps** — scans `/Applications` for apps that match a cask and adopts them via `brew install --cask --adopt`
- **App Store** — Mac App Store apps via the `mas` CLI, with a one-click `brew install mas` when it's missing
- **Security** — CVE scanning for installed formulae via [OSV.dev](https://osv.dev), duplicate-install detection, and per-cask Gatekeeper/code-signing inspection with quarantine-flag removal
- **Maintenance** — `brew doctor`, cleanup (with dry-run + cache size), orphaned-dependency removal (`brew autoremove`), Brewfile import/export via native dialogs, raw `brew config`
- **History** — a local activity log of everything mead has done
- Favorites, tags, and private notes per package — all persisted locally
- A live streaming console for every brew command, with cancel support

Favorites, tags, notes, snoozes, and history are stored locally in
`~/Library/Application Support/mead/store.json` — nothing leaves your machine
except the OSV.dev vulnerability lookups (formula name + version only).

## Requirements

- [Homebrew](https://brew.sh) already installed
- macOS on Apple Silicon (arm64)

## Development

```sh
wails dev
```

Runs a Vite dev server with hot reload. A dev bridge also runs at
`http://localhost:34115` if you want to drive the Go bindings from a regular
browser tab's devtools.

## Building

```sh
wails build
```

Produces `build/bin/mead.app`. See `.github/workflows/ci.yml` for the same
build running in CI on every push.

## Releasing

Releases are versioned and tagged automatically by
[release-please](https://github.com/googleapis/release-please), driven by
[Conventional Commits](https://www.conventionalcommits.org) in PR titles
(enforced by `.github/workflows/pr-title.yml` — `feat:`, `fix:`, `feat!:` /
a `BREAKING CHANGE:` footer for breaking changes, `docs:`, `chore:`, etc).
Every merge to `master` updates a standing "Release PR" with the next
version and changelog; merging *that* PR is what actually cuts the release
— `.github/workflows/release.yml` then builds `mead.app`, zips it, builds a
DMG installer, and attaches both to the GitHub Release release-please just
created. Versions carry a `-pre-alpha.N` suffix until the project is stable.

Release builds are unsigned (no Apple Developer ID in this project), so
Gatekeeper will block a plain double-click — see the release notes on each
[release](../../releases) for the one-line fix.
