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
	out, err := system.RunCmd(ctx, "mas", "list")
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
	out, err := system.RunCmd(ctx, "mas", "outdated")
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
