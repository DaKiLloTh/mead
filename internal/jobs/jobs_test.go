package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMasTargetResolvesMasBinary guards against the regression where Mac App
// Store upgrade jobs actually ran through brew's binary resolution: start()
// used to unconditionally call brew.ResolveBrewPath() and exec `brew`
// regardless of which job it was launching, so clicking "Upgrade" on an App
// Store app ran `brew upgrade <numeric-id>` (which always fails) and
// "Upgrade all App Store apps" ran bare `brew upgrade` (which silently
// upgraded every outdated Homebrew formula/cask on the system). masTarget
// must resolve strictly by looking up `mas` on PATH, independent of whatever
// brew binary happens to be installed.
func TestMasTargetResolvesMasBinary(t *testing.T) {
	dir := t.TempDir()
	masPath := filepath.Join(dir, "mas")
	if err := os.WriteFile(masPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("writing fake mas binary: %v", err)
	}

	t.Setenv("PATH", dir)

	got, err := masTarget.resolve()
	if err != nil {
		t.Fatalf("masTarget.resolve() error = %v, want nil", err)
	}
	if got != masPath {
		t.Errorf("masTarget.resolve() = %q, want %q", got, masPath)
	}
}

// TestMasTargetResolveErrorMentionsMas checks that the "not found" error
// actually names mas, not brew -- exactly the kind of misdirection the
// original bug produced (a `brew upgrade` failure for what's supposed to be
// an App Store action).
func TestMasTargetResolveErrorMentionsMas(t *testing.T) {
	dir := t.TempDir() // empty: nothing on PATH
	t.Setenv("PATH", dir)

	_, err := masTarget.resolve()
	if err == nil {
		t.Fatal("masTarget.resolve() error = nil, want an error since mas isn't on PATH")
	}
	if !strings.Contains(err.Error(), "mas") {
		t.Errorf("masTarget.resolve() error = %q, want it to mention mas", err.Error())
	}
}

// TestMasTargetDoesNotUseBrewEnv guards the other half of the bug fix: mas
// jobs must not inherit brew's HOMEBREW_* environment overrides (brewTarget
// sets a defaultEnv, masTarget deliberately doesn't so the subprocess just
// inherits this process's environment, same as brew.RunCmd does for mas
// elsewhere in this codebase).
func TestMasTargetDoesNotUseBrewEnv(t *testing.T) {
	if masTarget.defaultEnv != nil {
		t.Error("masTarget.defaultEnv is set, want nil (mas should inherit the process environment, not brew's)")
	}
	if brewTarget.defaultEnv == nil {
		t.Error("brewTarget.defaultEnv is nil, want brew.Env (regression in an unrelated target, not just mas)")
	}
}
