package app

import (
	"slices"
	"strings"
	"testing"

	"mead/internal/brew"
)

// containsFlag reports whether args contains the exact flag/token.
func containsFlag(args []string, flag string) bool {
	return slices.Contains(args, flag)
}

// containsAppDirFlag reports whether any element of args is an --appdir=...
// flag (regardless of the configured directory value).
func containsAppDirFlag(args []string) bool {
	for _, a := range args {
		if strings.HasPrefix(a, "--appdir=") {
			return true
		}
	}
	return false
}

func TestCaskAppDirFlag(t *testing.T) {
	t.Run("no custom dir", func(t *testing.T) {
		got := caskAppDirFlag("")
		if len(got) != 0 {
			t.Errorf("expected no flag, got %v", got)
		}
	})

	t.Run("custom dir", func(t *testing.T) {
		got := caskAppDirFlag("/Users/me/Applications")
		if !containsFlag(got, "--appdir=/Users/me/Applications") {
			t.Errorf("expected --appdir=/Users/me/Applications in %v", got)
		}
		if len(got) != 1 {
			t.Errorf("expected exactly one flag, got %v", got)
		}
	})
}

func TestCaskFlagsFor(t *testing.T) {
	t.Run("no custom dir", func(t *testing.T) {
		got := caskFlagsFor("")
		if !containsFlag(got, "--cask") {
			t.Errorf("expected --cask in %v", got)
		}
		if containsAppDirFlag(got) {
			t.Errorf("did not expect --appdir flag in %v", got)
		}
	})

	t.Run("custom dir", func(t *testing.T) {
		got := caskFlagsFor("/Users/me/Applications")
		if !containsFlag(got, "--cask") {
			t.Errorf("expected --cask in %v", got)
		}
		if !containsFlag(got, "--appdir=/Users/me/Applications") {
			t.Errorf("expected --appdir=/Users/me/Applications in %v", got)
		}
	})
}

func TestBuildAdoptCaskArgs(t *testing.T) {
	t.Run("no custom dir", func(t *testing.T) {
		args := buildAdoptCaskArgs("google-chrome", "", false)
		if !containsFlag(args, "--cask") {
			t.Errorf("expected --cask in %v", args)
		}
		if !containsFlag(args, "--adopt") {
			t.Errorf("expected --adopt in %v", args)
		}
		if containsFlag(args, "--force") {
			t.Errorf("did not expect --force when force is false: %v", args)
		}
		if !containsFlag(args, "google-chrome") {
			t.Errorf("expected package name in %v", args)
		}
		if containsAppDirFlag(args) {
			t.Errorf("did not expect --appdir flag when unset: %v", args)
		}
	})

	t.Run("custom dir", func(t *testing.T) {
		args := buildAdoptCaskArgs("google-chrome", "/Volumes/Data/Applications", false)
		if !containsFlag(args, "--appdir=/Volumes/Data/Applications") {
			t.Errorf("expected --appdir=/Volumes/Data/Applications in %v", args)
		}
		if !containsFlag(args, "--cask") {
			t.Errorf("expected --cask in %v", args)
		}
		if !containsFlag(args, "--adopt") {
			t.Errorf("expected --adopt in %v", args)
		}
	})

	t.Run("force, version mismatch", func(t *testing.T) {
		args := buildAdoptCaskArgs("bambu-studio", "", true)
		if !containsFlag(args, "--force") {
			t.Errorf("expected --force in %v", args)
		}
		if containsFlag(args, "--adopt") {
			t.Errorf("did not expect --adopt when force is true (brew rejects combining them): %v", args)
		}
		if !containsFlag(args, "bambu-studio") {
			t.Errorf("expected package name in %v", args)
		}
	})
}

func TestBuildCollectionInstallArgs(t *testing.T) {
	// Mirrors the real "Web Dev" collection: a mix of formulae and one cask.
	mixed := []brew.CollectionPackage{
		{Name: "node"}, {Name: "yarn"}, {Name: "git"}, {Name: "gh"},
		{Name: "watchman"}, {Name: "visual-studio-code", IsCask: true},
	}

	t.Run("cask present, custom dir set", func(t *testing.T) {
		args := buildCollectionInstallArgs(mixed, "/Users/me/Applications")
		if !containsFlag(args, "--appdir=/Users/me/Applications") {
			t.Errorf("expected --appdir=/Users/me/Applications in %v", args)
		}
		for _, p := range mixed {
			if !containsFlag(args, p.Name) {
				t.Errorf("expected package %q in %v", p.Name, args)
			}
		}
		// A mixed collection must not force --cask: that would make brew
		// try to resolve the formula names (node, yarn, ...) as casks too.
		if containsFlag(args, "--cask") {
			t.Errorf("did not expect --cask to be forced for a mixed collection: %v", args)
		}
	})

	t.Run("cask present, no custom dir", func(t *testing.T) {
		args := buildCollectionInstallArgs(mixed, "")
		if containsAppDirFlag(args) {
			t.Errorf("did not expect --appdir flag when unset: %v", args)
		}
	})

	t.Run("formula-only collection, custom dir set", func(t *testing.T) {
		formulaOnly := []brew.CollectionPackage{
			{Name: "docker"}, {Name: "kubectl"}, {Name: "terraform"},
		}
		args := buildCollectionInstallArgs(formulaOnly, "/Users/me/Applications")
		if containsAppDirFlag(args) {
			t.Errorf("did not expect --appdir flag with no casks in collection: %v", args)
		}
	})

	t.Run("args start with install and end with package names", func(t *testing.T) {
		args := buildCollectionInstallArgs(mixed, "/custom/dir")
		if len(args) == 0 || args[0] != "install" {
			t.Fatalf("expected args to start with \"install\", got %v", args)
		}
		last := args[len(args)-1]
		if last != mixed[len(mixed)-1].Name {
			t.Errorf("expected args to end with package names, got %v", args)
		}
	})
}
