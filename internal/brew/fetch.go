package brew

import (
	"context"
	"fmt"
	"strings"
)

// FetchCask downloads a cask's install artifact into Homebrew's own cache
// via `brew fetch --cask`, without installing anything, and returns the
// local path Homebrew downloaded it to -- resolved deterministically via
// `brew --cache --cask`, the same path `brew install` would read from
// itself, rather than parsed out of `brew fetch`'s own progress output.
//
// If the artifact is already cached -- from a previous call to this, or
// from `brew install` itself -- `brew fetch` skips the network round trip
// entirely and this just resolves the existing path, so repeated calls are
// cheap after the first. The first call for an app that hasn't been
// downloaded before is not cheap: it downloads the exact same file `brew
// install --cask` would, which for some casks (browsers, IDEs, media apps)
// can be hundreds of megabytes. There is no lighter-weight "just the
// metadata" probe for code-signing status in Homebrew's model -- confirmed
// against real `brew info --cask --json=v2` output for several casks while
// researching issue #50 -- so callers should treat this as an explicit,
// potentially large network operation, never something triggered
// automatically (e.g. on hover or tab-open).
func FetchCask(ctx context.Context, name string) (string, error) {
	if err := ValidName(name); err != nil {
		return "", err
	}
	if _, err := RunBrew(ctx, "fetch", "--cask", name); err != nil {
		return "", err
	}
	out, err := RunBrew(ctx, "--cache", "--cask", name)
	if err != nil {
		return "", err
	}
	path := strings.TrimSpace(out)
	if path == "" {
		return "", fmt.Errorf("brew didn't report a download location for %s", name)
	}
	return path, nil
}
