package main

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

func validName(name string) error {
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

func resolveBrewPath() (string, error) {
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
			brewPathErr = errors.New("could not find the `brew` executable on this system; is Homebrew installed?")
			return
		}
		brewPath = p
	})
	return brewPath, brewPathErr
}

// brewEnv returns a stable, non-interactive environment for brew subprocesses.
func brewEnv() []string {
	return append(baseEnv(),
		"HOMEBREW_NO_COLOR=1",
		"HOMEBREW_NO_EMOJI=1",
		"NONINTERACTIVE=1",
		"HOMEBREW_NO_ANALYTICS=1",
	)
}

// runBrew executes brew synchronously and returns combined stdout (stderr is
// captured separately for error reporting). It does not stream output; use
// the job manager for long-running/interactive commands.
func runBrew(ctx context.Context, args ...string) (string, error) {
	path, err := resolveBrewPath()
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = brewEnv()
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

// runBrewLines runs brew and splits stdout into non-empty trimmed lines.
func runBrewLines(ctx context.Context, args ...string) ([]string, error) {
	out, err := runBrew(ctx, args...)
	if err != nil {
		return nil, err
	}
	lines := []string{}
	for _, l := range strings.Split(out, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			lines = append(lines, l)
		}
	}
	return lines, nil
}
