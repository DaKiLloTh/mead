package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mead/internal/brew"
)

// Version is mead's own version, embedded at build time via
// `-ldflags "-X mead/internal/app.Version=1.2.3"` (see .github/workflows/
// release.yml). Left as the "dev" default for `wails dev`/local builds,
// which deliberately never report an update available -- there's no
// meaningful "version on disk" to compare against outside a real release
// build in /Applications.
var Version = "dev"

// deriveBundlePath walks up from a running executable's path
// (.../mead.app/Contents/MacOS/mead, as os.Executable() reports it inside
// a real macOS app bundle) to the .app bundle root. Pure and separately
// testable from the real os.Executable() call site below.
//
// Returns an error for anything that doesn't look like a real bundle
// layout -- notably `wails dev`'s own build output and `go run`, neither
// of which places the binary three directories under a `.app` -- since
// there's no bundle to compare a version against in that case, and
// UpdateAvailable should just quietly report nothing rather than error.
func deriveBundlePath(exePath string) (string, error) {
	macOSDir := filepath.Dir(exePath)
	contentsDir := filepath.Dir(macOSDir)
	bundlePath := filepath.Dir(contentsDir)

	if filepath.Base(macOSDir) != "MacOS" || filepath.Base(contentsDir) != "Contents" || !strings.HasSuffix(bundlePath, ".app") {
		return "", fmt.Errorf("%q doesn't look like it's running from inside a .app bundle", exePath)
	}
	return bundlePath, nil
}

// updateAvailable is the pure decision at the center of self-update
// detection: given the version compiled into this running process and the
// version currently sitting on disk (re-read fresh from Info.plist every
// check, see UpdateAvailable below), decide what to report to the
// frontend. "" means no restart banner; a non-empty string is the new
// version now on disk, for the banner's copy.
func updateAvailable(running, onDisk string) string {
	if running == "dev" || onDisk == "" || onDisk == running {
		return ""
	}
	return onDisk
}

// UpdateAvailable reports the version now sitting in mead's own .app
// bundle on disk, if it differs from the version actually running in this
// process -- meaning something outside mead (`brew upgrade --cask mead`,
// run by the user or by Homebrew itself, or a manual reinstall) replaced
// the bits on disk while this process was already running. Returns "" if
// no restart is needed: versions match, this isn't a real installed
// bundle (wails dev/go run), or the on-disk version can't be determined.
//
// Mead never triggers this replacement itself -- there's no downloading,
// no auto-install, nothing silent. This only ever *notices* an update
// that already happened via the normal, user- or Homebrew-driven
// `brew upgrade` path, the same way Finder would show a different
// version in Get Info if you looked. See brew.ReadInstalledAppVersion's
// existing use in the Adopt flow for the same plutil-based technique.
func (a *App) UpdateAvailable() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	bundlePath, err := deriveBundlePath(exePath)
	if err != nil {
		return ""
	}
	onDisk := brew.ReadInstalledAppVersion(a.ctx, bundlePath)
	return updateAvailable(Version, onDisk)
}

// restartArgs builds the `open` argument list to relaunch mead's own
// bundle. Pure and separately testable from the actual process-starting
// code below -- `-n` (always start a new instance) matters here since
// this process is about to quit anyway, so there needs to be a genuinely
// new instance already starting rather than a request that would
// otherwise just refocus the one we're quitting.
func restartArgs(bundlePath string) []string {
	return []string{"-n", bundlePath}
}

// startCommand is exec.Command(...).Start by default, overridden in tests
// so RestartApp's actual relaunch call can be verified (which binary,
// which args) without really spawning a process.
var startCommand = func(name string, args ...string) error {
	return exec.Command(name, args...).Start()
}

// RestartApp relaunches mead from its current on-disk bundle (picking up
// whatever `brew upgrade --cask mead` just replaced it with) and quits
// this process.
func (a *App) RestartApp() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	bundlePath, err := deriveBundlePath(exePath)
	if err != nil {
		return err
	}
	if err := startCommand("open", restartArgs(bundlePath)...); err != nil {
		return err
	}
	go runtime.Quit(a.ctx)
	return nil
}
