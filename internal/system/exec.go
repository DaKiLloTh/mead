// Package system runs local macOS command-line tools that mead shells out
// to outside of Homebrew itself -- xattr, spctl, codesign, mas, tmutil,
// open, and the like. It has no dependency on Homebrew's data layer, so it
// stays separate from package brew even though "run a brew subcommand" and
// "run one of these system tools" look superficially similar.
package system

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

// RunCmd executes an arbitrary local binary (not brew) and returns its
// combined stdout+stderr, for the handful of macOS system tools we shell
// out to (xattr, spctl, codesign, mas, tmutil, open, ...).
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
