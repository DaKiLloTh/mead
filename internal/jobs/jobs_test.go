package jobs

import (
	"reflect"
	"testing"

	"mead/internal/brew"
)

// TestMasTargetResolvesViaMasNotBrew guards against the regression where Mac
// App Store upgrade jobs actually ran through brew's binary resolution:
// start() used to unconditionally call brew.ResolveBrewPath() and exec
// `brew` regardless of which job it was launching, so clicking "Upgrade" on
// an App Store app ran `brew upgrade <numeric-id>` (which always fails) and
// "Upgrade all App Store apps" ran bare `brew upgrade` (which silently
// upgraded every outdated Homebrew formula/cask on the system).
//
// Compares the resolved function by pointer rather than exercising it
// against a faked PATH: ResolveMasPath checks Homebrew's own well-known bin
// directories before falling back to PATH (see exec.go's masPathCandidates
// -- mas is itself a Homebrew formula, and a bare PATH lookup alone can miss
// it for a GUI-launched, non-terminal process), so a test that only
// controls PATH can no longer force a specific resolved path or a lookup
// failure on a machine that genuinely has mas installed. Checking the
// wiring directly is what this test actually cares about, and is exact
// regardless of what's installed on the machine running it.
func TestMasTargetResolvesViaMasNotBrew(t *testing.T) {
	got := reflect.ValueOf(masTarget.resolve).Pointer()
	wantMas := reflect.ValueOf(brew.ResolveMasPath).Pointer()
	dontWantBrew := reflect.ValueOf(brew.ResolveBrewPath).Pointer()

	if got != wantMas {
		t.Error("masTarget.resolve is not brew.ResolveMasPath -- mas jobs would resolve through the wrong function")
	}
	if got == dontWantBrew {
		t.Error("masTarget.resolve is brew.ResolveBrewPath -- the original regression this test guards against")
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
