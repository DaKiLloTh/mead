package brew

import (
	"context"
	"regexp"
	"strings"

	"mead/internal/system"
)

// MasAvailable reports whether the `mas` CLI (github.com/mas-cli/mas) is on
// PATH. mas itself is installable via Homebrew, so when it's missing we
// just point the user at `brew install mas` instead of hiding the feature.
func MasAvailable() bool {
	_, err := ResolveMasPath()
	return err == nil
}

var masListRe = regexp.MustCompile(`^(\d+)\s+(.+?)\s+\(([^)]+)\)\s*$`)
var masOutdatedRe = regexp.MustCompile(`^(\d+)\s+(.+?)\s+\(([^)]+)\s*->\s*([^)]+)\)\s*$`)

// MasList returns every Mac App Store app `mas` knows is installed.
func MasList(ctx context.Context) ([]MasApp, error) {
	masPath, err := ResolveMasPath()
	if err != nil {
		return nil, err
	}
	// system.RunCmd's own LookPath(name) is a bare, no-well-known-paths
	// lookup -- fine for the standard macOS system tools it's normally
	// called with (xattr, spctl, tmutil, ...), always on the default
	// PATH regardless of launch context, but not for mas, a Homebrew
	// formula. Passing the already-resolved absolute path here (instead
	// of the bare "mas" name) makes RunCmd's LookPath a plain existence/
	// executable-bit check on that literal path rather than a PATH
	// search, so this doesn't reintroduce the exact bug ResolveMasPath
	// exists to fix -- see its doc comment.
	out, err := system.RunCmd(ctx, masPath, "list")
	if err != nil {
		return nil, err
	}
	apps := []MasApp{}
	for line := range strings.SplitSeq(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if m := masListRe.FindStringSubmatch(line); m != nil {
			apps = append(apps, MasApp{ID: m[1], Name: m[2], InstalledVersion: m[3]})
		}
	}
	return apps, nil
}

// MasOutdated returns Mac App Store apps with an available update.
func MasOutdated(ctx context.Context) ([]MasApp, error) {
	masPath, err := ResolveMasPath()
	if err != nil {
		return nil, err
	}
	out, err := system.RunCmd(ctx, masPath, "outdated")
	if err != nil {
		return nil, err
	}
	apps := []MasApp{}
	for line := range strings.SplitSeq(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if m := masOutdatedRe.FindStringSubmatch(line); m != nil {
			apps = append(apps, MasApp{ID: m[1], Name: m[2], InstalledVersion: m[3], LatestVersion: m[4], Outdated: true})
		}
	}
	return apps, nil
}
