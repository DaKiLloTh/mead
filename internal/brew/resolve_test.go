package brew

import (
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
)

// fakeLookPath returns a lookPath stand-in that only "finds" the given
// names, recording every name it's asked to check (in order) into *checked.
func fakeLookPath(checked *[]string, found ...string) func(string) (string, error) {
	foundSet := make(map[string]bool, len(found))
	for _, f := range found {
		foundSet[f] = true
	}
	return func(name string) (string, error) {
		*checked = append(*checked, name)
		if foundSet[name] {
			return name, nil
		}
		return "", errors.New("not found")
	}
}

// withFakeLookPath swaps the package's lookPath for the duration of fn,
// restoring the real exec.LookPath afterwards regardless of how fn exits.
func withFakeLookPath(t *testing.T, fake func(string) (string, error), fn func()) {
	t.Helper()
	orig := lookPath
	lookPath = fake
	defer func() { lookPath = orig }()
	fn()
}

// These exercise ResolveMasPath's actual priority-order/fallback logic
// against a controlled fake filesystem, not just the contents of
// masPathCandidates() -- this is the property that silently broke for
// months: mas had no candidate list at all, so a GUI-launched (Finder/Dock)
// mead, whose restricted default PATH doesn't include Homebrew's bin
// directory, reported a genuinely-installed mas as missing. Testing only
// the candidate list's contents wouldn't have caught a mistake in *how*
// they're checked (wrong order, an early return that skips the loop,
// checking the wrong variable, etc.) -- these tests would.

func TestResolveMasPathChecksWellKnownPathFirst(t *testing.T) {
	var checked []string
	withFakeLookPath(t, fakeLookPath(&checked, "/opt/homebrew/bin/mas"), func() {
		got, err := ResolveMasPath()
		if err != nil {
			t.Fatalf("ResolveMasPath() error = %v, want nil", err)
		}
		if got != "/opt/homebrew/bin/mas" {
			t.Errorf("ResolveMasPath() = %q, want %q", got, "/opt/homebrew/bin/mas")
		}
	})
	if len(checked) == 0 || checked[0] != "/opt/homebrew/bin/mas" {
		t.Errorf("checked = %v, want /opt/homebrew/bin/mas checked first", checked)
	}
	// A bare PATH lookup for "mas" must never even run once a well-known
	// path candidate already succeeded -- this is what actually catches a
	// regression to the old bare-LookPath-only behavior, since that old
	// code would also "work" whenever PATH happens to be rich enough
	// (every dev-mode test this bug hid behind).
	if slices.Contains(checked, "mas") {
		t.Errorf("checked = %v, want it to stop before falling back to a bare PATH lookup", checked)
	}
}

func TestResolveMasPathFallsBackToPathWhenNotAtWellKnownLocations(t *testing.T) {
	var checked []string
	withFakeLookPath(t, fakeLookPath(&checked, "mas"), func() {
		got, err := ResolveMasPath()
		if err != nil {
			t.Fatalf("ResolveMasPath() error = %v, want nil", err)
		}
		if got != "mas" {
			t.Errorf("ResolveMasPath() = %q, want %q", got, "mas")
		}
	})
	if checked[len(checked)-1] != "mas" {
		t.Errorf("checked = %v, want the bare \"mas\" PATH lookup to be tried last", checked)
	}
}

func TestResolveMasPathErrorsWhenNotFoundAnywhere(t *testing.T) {
	withFakeLookPath(t, fakeLookPath(new([]string)), func() {
		_, err := ResolveMasPath()
		if err == nil {
			t.Fatal("ResolveMasPath() error = nil, want an error since mas isn't found anywhere")
		}
		if !strings.Contains(err.Error(), "mas") {
			t.Errorf("ResolveMasPath() error = %q, want it to mention mas", err.Error())
		}
	})
}

// Same coverage for ResolveBrewPath, which has had this well-known-paths-
// first shape since before mas support existed but was never itself
// directly tested at this level either. sync.Once means the result is
// cached after the first real call in this process, so these reset that
// cache before and after to stay isolated from each other and from every
// other test in this package that might call ResolveBrewPath for real.

func resetBrewPathCache() {
	brewPathOnce = sync.Once{}
	brewPath = ""
	brewPathErr = nil
}

func TestResolveBrewPathChecksWellKnownPathsFirst(t *testing.T) {
	resetBrewPathCache()
	defer resetBrewPathCache()

	var checked []string
	withFakeLookPath(t, fakeLookPath(&checked, "/usr/local/bin/brew"), func() {
		got, err := ResolveBrewPath()
		if err != nil {
			t.Fatalf("ResolveBrewPath() error = %v, want nil", err)
		}
		if got != "/usr/local/bin/brew" {
			t.Errorf("ResolveBrewPath() = %q, want %q", got, "/usr/local/bin/brew")
		}
	})
	if slices.Contains(checked, "brew") {
		t.Errorf("checked = %v, want it to stop before falling back to a bare PATH lookup", checked)
	}
}

func TestResolveBrewPathErrorsWhenNotFoundAnywhere(t *testing.T) {
	resetBrewPathCache()
	defer resetBrewPathCache()

	withFakeLookPath(t, fakeLookPath(new([]string)), func() {
		_, err := ResolveBrewPath()
		if err == nil {
			t.Fatal("ResolveBrewPath() error = nil, want an error since brew isn't found anywhere")
		}
		if !strings.Contains(err.Error(), "brew") {
			t.Errorf("ResolveBrewPath() error = %q, want it to mention brew", err.Error())
		}
	})
}

