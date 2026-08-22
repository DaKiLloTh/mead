// Package brew is the Homebrew/macOS-CLI data layer: it shells out to brew
// (and a handful of other local CLIs like mas) and normalizes their output
// into plain Go types. It has no Wails coupling, so it can be exercised and
// reasoned about independently of the app/UI glue layer.
package brew

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
)

func baseEnv() []string {
	return append([]string{}, os.Environ()...)
}

// namePattern restricts package/tap/service names accepted from the frontend
// so they can never be interpreted as flags by brew (no leading dash) and
// can't smuggle shell metacharacters (they're never passed through a shell
// anyway, but this keeps brew's own arg parsing from being confused).
var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9@/_.+-]*$`)

// ValidName reports whether name is safe to pass to brew as a package, tap,
// or service name.
func ValidName(name string) error {
	if name == "" || !namePattern.MatchString(name) {
		return fmt.Errorf("invalid package name: %q", name)
	}
	return nil
}

var (
	brewPathOnce sync.Once
	brewPath     string
	brewPathErr  error
)

// ResolveBrewPath locates the `brew` executable, preferring the well-known
// Apple Silicon / Intel / Linuxbrew install locations before falling back to
// PATH lookup.
func ResolveBrewPath() (string, error) {
	brewPathOnce.Do(func() {
		candidates := []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew", "/home/linuxbrew/.linuxbrew/bin/brew"}
		for _, c := range candidates {
			if p, err := exec.LookPath(c); err == nil {
				brewPath = p
				return
			}
		}
		p, err := exec.LookPath("brew")
		if err != nil {
			brewPathErr = errors.New("could not find the `brew` executable on this system; is Homebrew installed")
			return
		}
		brewPath = p
	})
	return brewPath, brewPathErr
}

// ResolveMasPath locates the `mas` executable. Unlike brew, mas has no
// well-known install locations to search first -- Homebrew always installs
// it as a regular formula, so a plain PATH lookup is sufficient.
func ResolveMasPath() (string, error) {
	p, err := exec.LookPath("mas")
	if err != nil {
		return "", errors.New("could not find the `mas` executable on this system; install it with `brew install mas`")
	}
	return p, nil
}

// Env returns a stable, non-interactive environment for brew subprocesses.
// Without HOMEBREW_NO_AUTO_UPDATE, any brew command can silently trigger a
// full `brew update` first if it's been a while -- surprising and slow for a
// GUI where updating should be an explicit, visible action. We suppress that
// everywhere except the one job that IS an explicit update.
func Env() []string {
	return append(baseEnv(),
		"HOMEBREW_NO_COLOR=1",
		"HOMEBREW_NO_EMOJI=1",
		"NONINTERACTIVE=1",
		"HOMEBREW_NO_ANALYTICS=1",
		"HOMEBREW_NO_AUTO_UPDATE=1",
	)
}

// EnvAllowingAutoUpdate is Env() without the auto-update suppression, for
// the one job that should actually be allowed to update Homebrew itself.
func EnvAllowingAutoUpdate() []string {
	return append(baseEnv(),
		"HOMEBREW_NO_COLOR=1",
		"HOMEBREW_NO_EMOJI=1",
		"NONINTERACTIVE=1",
		"HOMEBREW_NO_ANALYTICS=1",
	)
}

// RunBrew executes brew synchronously and returns combined stdout (stderr is
// captured separately for error reporting). It does not stream output; use
// the jobs package for long-running/interactive commands.
func RunBrew(ctx context.Context, args ...string) (string, error) {
	path, err := ResolveBrewPath()
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = Env()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if msg == "" {
			msg = err.Error()
		}
		return stdout.String(), errors.New(msg)
	}
	return stdout.String(), nil
}

// RunCmd executes an arbitrary local binary (not brew) and returns its
// combined stdout+stderr, for the handful of macOS system tools we shell
// out to (xattr, spctl, codesign, mas, ...).
func RunCmd(ctx context.Context, name string, args ...string) (string, error) {
	path, err := exec.LookPath(name)
	if err != nil {
		return "", fmt.Errorf("%s not found on this system", name)
	}
	cmd := exec.CommandContext(ctx, path, args...)
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	err = cmd.Run()
	return out.String(), err
}

// runBrewLines runs brew and splits stdout into non-empty trimmed lines.
func runBrewLines(ctx context.Context, args ...string) ([]string, error) {
	out, err := RunBrew(ctx, args...)
	if err != nil {
		return nil, err
	}
	lines := []string{}
	for l := range strings.SplitSeq(out, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			lines = append(lines, l)
		}
	}
	return lines, nil
}
