# Cross-platform architecture: what a Linux build actually needs

Answers the question issue [#105](https://github.com/DaKiLloTh/mead/issues/105)
left open: not whether Linux is worth doing (it is, mead would be a real,
differentiated Homebrew GUI where the existing options are CLI-only or
formula-only), but what specifically has to change, and in what order. This
is a design document, not an implementation; nothing in this repo has been
changed to build for Linux yet.

Chose "native Linux build first" over WSL (see below for why) at the
maintainer's direction. This document covers the full architecture pass,
including why WSL follows rather than leads.

## Method

Rather than restating #105's own bullet points, this is a real inventory:
every macOS-specific call, path and library the current codebase makes, found
by grepping `internal/`, `cmd/mead-mon/` and `frontend/src/` for the actual
mechanisms (`osascript`, `codesign`, `tmutil`, hardcoded `/Applications` and
`~/Library` paths, the `mas` binary, `getlantern/systray`, Wails' `mac.Options`),
not by assumption.

## What already works today, unmodified

This is bigger than #105's text suggested, and worth stating plainly so the
scope of the actual work is clear:

- **`internal/brew/exec.go`'s `ResolveBrewPath`** already lists
  `/home/linuxbrew/.linuxbrew/bin/brew` as a candidate path, alongside the two
  macOS Homebrew prefixes. Someone anticipated this. Linuxbrew (Homebrew on
  Linux) is real, actively maintained, and speaks the same `brew info
  --json=v2` / `brew search` / `brew install` / `brew outdated` surface mead
  already drives for formulae. The entire formula-management half of the
  app -- Installed, Search, Updates, Taps, Services, Maintenance's cleanup/
  doctor/autoremove, Security's vulnerability scan, Dependency graph --
  is Homebrew CLI automation with no macOS-specific assumption baked in
  beyond a hardcoded path list that already includes the Linux one.
- **`internal/store/store.go`** uses `os.UserConfigDir()`, which is already
  fully cross-platform in the Go standard library (resolves to
  `~/.config/mead` on Linux, `~/Library/Application Support/mead` on macOS,
  with no code change needed).
- **`getlantern/systray`** (mead-mon's tray icon) has a real Linux (GTK/
  AppIndicator via D-Bus) and Windows backend, not just macOS. `go.mod`
  already carries `github.com/godbus/dbus/v5` as an indirect dependency of
  it. The tray icon itself does not need porting.
- **Wails' `options.App` struct** has sibling `Mac`, `Windows` and `Linux`
  fields that coexist in one value; a field for a platform the binary isn't
  built for is simply inert. `main.go` doesn't need a build tag just to keep
  `Mac: &mac.Options{...}` around once a `Linux: &linux.Options{...}` is
  added alongside it.
- **The frontend is a Preact/TypeScript SPA with no macOS-specific
  framework dependency.** `.drag-region`'s `-webkit-app-region: drag` (
  `frontend/src/style.css:193`) is a standard CSS webview affordance, not a
  macOS one; it degrades harmlessly (just does nothing) in a webview that
  doesn't support it.
- **`internal/jobs`'s pty-backed `StartMas`** uses `github.com/creack/pty`
  and `syscall.SysProcAttr{Setsid, Setctty}`, which are POSIX primitives
  that exist on Linux too. This function only becomes meaningless on Linux
  because `mas` (the Mac App Store CLI it wraps) has nothing to talk to
  there, not because the pty mechanism itself is macOS-only.

## What genuinely has no Linux equivalent, file by file

Everything below needs to be hidden behind a capability check on Linux, not
reimplemented, because the underlying OS concept does not exist there.

| Concept | Files | Linux story |
|---|---|---|
| Gatekeeper / code-signing inspection, quarantine removal | `internal/security/security.go` (`codesign`, `spctl`, `xattr`, `pkgutil`, `hdiutil`, `ditto`); `internal/security/precheck.go` (from #50/PR #189, same tools against a fetched-but-not-installed cask) | No equivalent. There is no cask ecosystem on Linux to gatekeep (see next row), so this entire feature area is inert there, not degraded. |
| `tmutil` local snapshots | `internal/security/security.go`'s snapshot helpers | Btrfs/LVM/ZFS snapshots exist on Linux but are filesystem-specific and not a single OS-level command; out of scope for a first Linux build, not a straightforward port. |
| Mac App Store (`mas`) | `internal/brew/mas.go`, `internal/brew/exec.go`'s `ResolveMasPath`, `internal/jobs/jobs.go`'s `StartMas`, `internal/app/app.go`'s Mas* methods, the whole App Store view/Adopt's `isAppStoreApp`/`detectAppStoreApp` in `internal/brew/adopt.go` | No equivalent; the App Store nav item disappears entirely on Linux. |
| Casks | `internal/brew/types.go` (`IsCask` runs through nearly every type), `internal/brew/brewinfo.go`, `internal/brew/adopt.go`, `internal/security/leftovers.go`'s `~/Library/*` scan paths, `--appdir`/zap-trash flag building, `RevealInFinder` (`open -R`) | **Verified, not assumed**: casks do not run on Linux at all. `brew install --cask` there errors outright ("Casks are not supported on Linux," see [Homebrew Discussion #3999](https://github.com/orgs/Homebrew/discussions/3999)); this is not a smaller cask surface, it is none. The cask-specific UI (Adopt, zap, appdir settings, the cask/formula split throughout Installed/Search) hides entirely on Linux, full stop -- see Flatpak, below, for what actually replaces it. |
| Notifications | `cmd/mead-mon/notify.go` (`osascript -e 'display notification'`, chosen specifically over `UNUserNotificationCenter` per that file's own doc comment) | Real Linux equivalent exists (`notify-send` / D-Bus `org.freedesktop.Notifications`), needs its own implementation, not a shared code path. |
| Icon extraction | `internal/security/icons.go` (`plutil -convert xml1`, `.icns` via `sips`) | Linux apps/packages don't carry `.icns`/`Info.plist`; icon sourcing on Linux (`.desktop` file `Icon=` keys, XDG icon theme lookup) is a different mechanism entirely, needs its own implementation. |
| Reveal-in-Finder | `internal/security/security.go`'s `RevealInFinder` (`open -R`) | `xdg-open <containing dir>` is the closest equivalent but doesn't support "select this specific file," only "open this folder" -- a real behavior difference to decide on, not just a swapped command. |
| Window chrome | `main.go`'s `mac.Options{TitleBar: mac.TitleBarHiddenInset(), ...}`; `Sidebar.tsx`/`App.tsx`'s drag-region assumptions | Needs a `Linux: &linux.Options{...}` block and a frontend check for whether to reserve the drag-region strip at all (Linux window managers draw their own title bar by default; Wails' Linux webview doesn't have macOS's floating traffic-light problem, so the reserved strip either becomes unnecessary or needs its own Linux-specific height). |

## Proposed shape: a capability layer, not a platform recompile

The pattern already exists in miniature (`ResolveBrewPath`'s candidate-path
list already branches on what's installed, not what's compiled). Generalize
it:

1. **`internal/platform` (new package).** One file per build target
   (`darwin.go` with `//go:build darwin`, `linux.go` with `//go:build linux`),
   exporting a single `Capabilities` struct: `HasGatekeeper`, `HasCasks`,
   `HasAppStore`, `HasTimeMachine`, `HasTouchID`, plus whatever
   platform-appropriate implementations each file provides for
   notifications/reveal-in-folder/icon extraction behind a shared interface.
   `internal/app/app.go` gets one new bound method, `App.Capabilities()`,
   returning this struct to the frontend once at startup.
2. **Frontend**: a `useCapabilities()` hook (same pattern as the existing
   `*Signal.ts` caches) read once at boot; `Sidebar.tsx`'s nav list and each
   view that assumes a capability (App Store, Adopt, Security's Gatekeeper
   tab, the zap/appdir cask settings) conditionally render based on it,
   rather than assuming macOS.
3. **Build tags on the Go side already do most of the heavy lifting** for
   the pieces in the table above: `internal/security/security_darwin.go`
   (the existing file's content, renamed) plus a new
   `internal/security/security_linux.go` that implements the same function
   signatures where a Linux equivalent exists (notifications, reveal-in-
   folder) and returns "unsupported" errors for the ones that don't
   (Gatekeeper, tmutil).
4. **CI**: a second `runs-on: ubuntu-latest` job in `.github/workflows/ci.yml`
   building the Linux target once step 1-3 land, so cross-platform
   compilation is enforced continuously rather than checked by hand.

This is deliberately not a rewrite: the Homebrew-formula half of the app
(the majority of the UI) needs no platform branch at all, because it was
never macOS-specific to begin with.

## Why native Linux before WSL

WSL is Linux userspace under Windows, not a third platform to build for
directly. Once a native Linux build exists (per the milestone above), WSL
support is most of the way there already for a machine with WSLg (WSL's own
GUI-app support, which forwards Linux GUI windows to the Windows desktop):
the same Linux binary should just run. Where WSL genuinely diverges is a
machine without WSLg, or where the actual desire is a Windows-native shell
around a WSL-side Homebrew install -- that is a different engineering
problem (a Windows build execing into `wsl.exe`, not a Wails Linux build at
all) and shouldn't be conflated with "Linux support" in scope or in a single
milestone.

## Flatpak: the actual Linux equivalent to a cask

Checked directly rather than assumed, since the first draft of this document
got this wrong (see the corrected table row above): Homebrew itself shipped
a real answer to "what's a cask on Linux" in **v5.0.4** (December 2025) --
`flatpak` as a first-class `Brewfile` entry type, Linux-only, with the same
verb set casks get on macOS: `brew bundle dump --flatpak --flatpak-remotes`,
`brew bundle install`, `brew bundle check`, `brew bundle list --flatpak`,
`brew bundle cleanup`. Sources:
[webpronews.com](https://www.webpronews.com/homebrew-5-0-4-update-adds-flatpak-support-for-cross-platform-apps/),
[Bluefin project docs](https://docs.projectbluefin.io/blog/flatpak-support-in-brewfiles/).

This is not a stretch or a mead-invented mapping: it is Homebrew's own,
Homebrew-shipped mechanism for exactly the gap casks leave on Linux (GUI
application packaging), using the same `Brewfile`/`brew bundle` plumbing
`internal/brew` and Maintenance's Brewfile tab already drive. A native Linux
build has a real path to feature parity with the macOS cask experience
without inventing a new package format itself: implement a `flatpak`
counterpart to the existing `Cask`/formula handling (own type, own icon/
name/version lookup via `flatpak info`, own install/uninstall job) rather
than trying to force Flatpak data through `BrewPackage`'s `IsCask` field.

Prior art worth knowing about, not competing with mead's own scope here:
[bold-brew](https://bold-brew.com/) is an existing terminal UI that already
manages Homebrew formulae, Mac App Store apps and Flatpak across macOS and
Linux -- confirms this is a validated direction, and is the closest thing
to a cross-platform "mead" that already exists today (as a TUI, not a native
GUI).

## Open questions for a real product decision, not an engineering one

- ~~Casks on Linux~~ **resolved, not actually a choice**: casks do not run
  on Linux at all (Homebrew itself refuses), so Installed/Search become
  formula-only there regardless of preference. The real open question this
  becomes: does mead add Flatpak support as the Linux build's cask
  equivalent (see below), or ship formula-only for the first milestone and
  revisit Flatpak later?
- **Which distro/desktop environment to target first** for packaging
  (a `.deb`, a Flatpak, an AppImage) and for the tray/notification testing
  matrix (GNOME's D-Bus tray situation is notably different from KDE's).
- **Whether mead-mon (the standalone background poller) ships on Linux at
  all in the first milestone**, or whether the main app's own background
  polling (already present, see `App.UpdateQuiet`) is enough for v1 and
  mead-mon's systray/notification port is deferred.

## Explicitly out of scope for this document

No code changes. No build-tag restructuring. No CI job. Those are the next
piece of work, once the open questions above have real answers.
