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
//
// "/" and "." are allowed because real names need them: tap names
// (homebrew/cask), tap-qualified formula/cask names (user/tap/formula), and
// versioned formulae (node@18, openssl@1.1). Go's regexp package is RE2,
// which has no lookahead, so the extra exclusions that keep those characters
// from being abused for path traversal -- a literal ".." segment, an empty
// "//" segment, or a trailing "/" -- can't be expressed in the pattern
// itself and are checked separately in ValidName below. A leading "/" is
// already impossible here since the pattern requires the first character to
// be alphanumeric.
var namePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9@/_.+-]*$`)

// ValidName reports whether name is safe to pass to brew as a package, tap,
// or service name.
func ValidName(name string) error {
	if name == "" ||
		!namePattern.MatchString(name) ||
		strings.Contains(name, "..") ||
		strings.Contains(name, "//") ||
		strings.HasSuffix(name, "/") {
		return fmt.Errorf("invalid package name: %q", name)
	}
	return nil
}

var (
	brewPathOnce sync.Once
	brewPath     string
	brewPathErr  error
)

// lookPath is exec.LookPath by default, overridden in tests so
// ResolveBrewPath/ResolveMasPath's actual priority-order/fallback logic can
// be exercised against a controlled, fake filesystem instead of only the
// pure candidate list -- this is deliberately named to be testable at this
// exact seam, since "checks the well-known paths before PATH" being
// correct in *execution*, not just in the candidate list's contents, is
// precisely the property that broke silently for months (mas's candidate
// list didn't exist at all; see ResolveMasPath's doc comment).
var lookPath = exec.LookPath

// ResolveBrewPath locates the `brew` executable, preferring the well-known
// Apple Silicon / Intel / Linuxbrew install locations before falling back to
// PATH lookup.
func ResolveBrewPath() (string, error) {
	brewPathOnce.Do(func() {
		candidates := []string{"/opt/homebrew/bin/brew", "/usr/local/bin/brew", "/home/linuxbrew/.linuxbrew/bin/brew"}
		for _, c := range candidates {
			if p, err := lookPath(c); err == nil {
				brewPath = p
				return
			}
		}
		p, err := lookPath("brew")
		if err != nil {
			brewPathErr = errors.New("could not find the `brew` executable on this system; is Homebrew installed")
			return
		}
		brewPath = p
	})
	return brewPath, brewPathErr
}

// masPathCandidates returns the well-known locations to check for `mas`
// before falling back to a bare PATH lookup, in priority order. Pure and
// separately testable from the actual filesystem check below.
func masPathCandidates() []string {
	return []string{"/opt/homebrew/bin/mas", "/usr/local/bin/mas"}
}

// ResolveMasPath locates the `mas` executable, checking Homebrew's own
// well-known bin directories first -- mas is itself a regular Homebrew
// formula, so it lives at the same prefix as `brew` (see ResolveBrewPath
// above), which a bare PATH lookup alone can miss. This matters because
// mead, launched normally (Finder/Dock/LaunchServices rather than a
// terminal), doesn't inherit the user's shell PATH -- it gets a minimal
// system default that doesn't include Homebrew's bin directory, even
// though `mas` is genuinely installed. Falls back to a plain PATH lookup
// for anyone with mas installed somewhere else entirely.
func ResolveMasPath() (string, error) {
	for _, c := range masPathCandidates() {
		if p, err := lookPath(c); err == nil {
			return p, nil
		}
	}
	p, err := lookPath("mas")
	if err != nil {
		return "", errors.New("could not find the `mas` executable on this system; install it with `brew install mas`")
	}
	return p, nil
}

// fixedEnvVars are the HOMEBREW_*/NONINTERACTIVE overrides Env applies on
// top of the inherited environment -- see Env's doc comment for why. Kept as
// a single literal list so Env and FixedEnvVars can't drift apart.
var fixedEnvVars = []string{
	"HOMEBREW_NO_COLOR=1",
	"HOMEBREW_NO_EMOJI=1",
	"NONINTERACTIVE=1",
	"HOMEBREW_NO_ANALYTICS=1",
	"HOMEBREW_NO_AUTO_UPDATE=1",
}

// Env returns a stable, non-interactive environment for brew subprocesses.
// Without HOMEBREW_NO_AUTO_UPDATE, any brew command can silently trigger a
// full `brew update` first if it's been a while -- surprising and slow for a
// GUI where updating should be an explicit, visible action. We suppress that
// everywhere except the one job that IS an explicit update.
func Env() []string {
	return append(baseEnv(), fixedEnvVars...)
}

// FixedEnvVars returns a copy of the fixed HOMEBREW_*/NONINTERACTIVE
// overrides Env applies, as "KEY=value" strings. It exists for callers that
// can't just set cmd.Env because the subprocess doesn't inherit this
// process's environment at all -- namely the jobs package's elevated
// uninstall path, which re-enters a shell via `osascript ... do shell
// script`, so the same defaults have to be embedded literally in the shell
// command text instead.
func FixedEnvVars() []string {
	return append([]string{}, fixedEnvVars...)
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
	return runBrewWithEnv(ctx, Env(), args...)
}

// runBrewWithEnv is RunBrew with an explicit environment instead of the
// default Env(). Split out so Update (below) can run with
// EnvAllowingAutoUpdate instead of Env's update-suppressing default, the
// same way the GUI's explicit "Update Homebrew" job already does, without
// duplicating the process-running logic.
func runBrewWithEnv(ctx context.Context, env []string, args ...string) (string, error) {
	path, err := ResolveBrewPath()
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = env
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

// Update runs `brew update`, refreshing Homebrew's local index of available
// formula/cask versions from its taps -- the index `brew outdated` compares
// against, and which nothing refreshes on its own (see Env's doc comment
// above). Like the GUI's explicit "Update Homebrew" job, this needs
// EnvAllowingAutoUpdate rather than the default Env(), otherwise the very
// env var that suppresses *other* commands' auto-update side effect would
// also suppress this explicit one.
//
// mead-mon calls this before each outdated check so its notifications don't
// go stale against a local index nothing else ever refreshes (see issue
// #88); the main GUI app runs the equivalent job itself, see App.Update and
// App.UpdateQuiet in internal/app.
func Update(ctx context.Context) error {
	_, err := runBrewWithEnv(ctx, EnvAllowingAutoUpdate(), "update")
	return err
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
