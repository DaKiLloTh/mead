# mead

A native Homebrew GUI for macOS, built with Go + [Wails](https://wails.io) + React.

[getmead.app](https://getmead.app)

## Features

- **Dashboard**: installed/outdated counts, a health tile (deprecated/disabled/pinned), one-click update/upgrade-all/doctor
- **Installed**: browse formulae + casks, filter by type/outdated/favorites, bulk multi-select actions, per-row pin/upgrade/uninstall
- **Search**: live `brew search` across formulae and casks, install inline
- **Collections**: curated package bundles (Web Dev, DevOps, Data Science, …) installable in one click
- **Updates**: per-item or bulk upgrade, snooze updates for a day/week/month
- **Taps** / **Services**: add/remove taps, start/stop/restart `brew services`
- **Adopt Existing Apps**: scans `/Applications` for apps that match a cask and adopts them via `brew install --cask --adopt`
- **App Store**: Mac App Store apps via the `mas` CLI, with a one-click `brew install mas` when it's missing
- **Security**: CVE scanning for installed formulae via Homebrew's `brew vulns` (OSV.dev data, with severity and patch-aware results; falls back to a direct OSV.dev lookup on Homebrew older than 7), duplicate-install detection, and per-cask Gatekeeper/code-signing inspection with quarantine-flag removal
- **Maintenance**: `brew doctor`, cleanup (with dry-run + cache size), orphaned-dependency removal (`brew autoremove`), Brewfile import/export via native dialogs, raw `brew config`
- **History**: a local activity log of everything mead has done
- Favorites, tags, and private notes per package, all persisted locally
- A live streaming console for every brew command, with cancel support

Favorites, tags, notes, snoozes, and history are stored locally in
`~/Library/Application Support/mead/store.json`. Nothing leaves your machine
except the OSV.dev vulnerability lookups, made by `brew vulns` (or directly by mead on Homebrew older than 7).

## Requirements

- [Homebrew](https://brew.sh) already installed
- macOS on Apple Silicon (arm64) or Intel (x86_64)

## Install

Via the [homebrew-mead](https://github.com/DaKiLloTh/homebrew-mead) tap:

```sh
brew tap DaKiLloTh/mead
brew install --cask mead
```

This handles the unsigned-build/quarantine situation automatically. If you'd
rather install manually, grab the DMG or zip from the
[latest release](../../releases/latest) and see its notes for the one-line
Gatekeeper fix.

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

Don't create releases by hand. Never use GitHub's "Draft a new release"
button or push a `v*` tag yourself. The release workflow only runs when the
release PR is merged, so a hand-made release ships with no builds attached,
and it also stops release-please from creating that version later.

### To cut a release

1. Open the PR titled **`chore(master): release X.Y.Z`** (from the
   `release-please--branches--master` branch). There's always one open if
   anything releasable has merged since the last release.
2. Check its version and changelog. Wait for CI to pass.
3. Squash-merge it.

That's it. `.github/workflows/release.yml` then runs automatically (about
4 minutes) and:

- creates the `vX.Y.Z` tag and GitHub Release, marked as a pre-release
  titled `Pre-Alpha vX.Y.Z`
- builds `mead.app` for Apple Silicon (arm64) and Intel (amd64), and
  attaches a zip and a DMG for each
- adds the Gatekeeper install notes to the release body
- mirrors the files to `DaKiLloTh/homebrew-mead` and bumps the cask (needs
  the `HOMEBREW_TAP_TOKEN` secret, and skips with a warning without it)

Follow it with `gh run watch` or in the Actions tab.

### How the version is chosen

PRs are squash-merged, so each PR title becomes a commit on `master`. Titles
must be [Conventional Commits](https://www.conventionalcommits.org)
(`.github/workflows/pr-title.yml` enforces this).
[release-please](https://github.com/googleapis/release-please) reads them
and keeps the release PR up to date:

| PR title | Effect while below 1.0 |
| --- | --- |
| `fix: ...` | patch bump (0.12.0 → 0.12.1) |
| `feat: ...` | minor bump (0.12.0 → 0.13.0) |
| `feat!: ...` or a `BREAKING CHANGE:` footer | minor bump |
| `docs:`, `chore:`, `refactor:`, `test:`, `ci:` | no release, and not in the changelog |

If only `refactor:`/`chore:`-type PRs have merged, there's no release PR,
and there's nothing to release.

### If a release went wrong

- **A hand-made release or tag exists for the version the release PR
  wants:** delete it with `gh release delete vX.Y.Z --cleanup-tag --yes`,
  then merge the release PR.
- **The release PR merged but the build failed for a flaky reason:** re-run
  the failed jobs from the Actions tab. The upload uses `--clobber`, so
  that's safe. A re-run builds the tag, so a code fix has to go out as the
  next release instead.

Release builds are unsigned (no Apple Developer ID in this project), so
Gatekeeper will block a plain double-click. See the release notes on each
[release](../../releases) for the one-line fix.
