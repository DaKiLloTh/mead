package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestResolveCaskAppPathKnownCask exercises the same server-side resolution
// path App.RemoveQuarantine and App.InspectCaskSecurity use to turn a cask
// name into a concrete .app path: it should prefer an entry from the
// package's own AppPaths (as populated from `brew info`'s artifact list)
// when that path actually exists on disk.
func TestResolveCaskAppPathKnownCask(t *testing.T) {
	dir := t.TempDir()
	appPath := filepath.Join(dir, "Managed.app")
	if err := os.MkdirAll(appPath, 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}

	pkg := &BrewPackage{
		Name:     "managed-cask",
		FullName: "managed-cask",
		AppPaths: []string{appPath},
	}

	got := resolveCaskAppPath(pkg)
	if got != appPath {
		t.Fatalf("resolveCaskAppPath() = %q, want %q", got, appPath)
	}
}

// TestResolveCaskAppPathUnmanagedFails verifies that a cask mead doesn't
// actually manage -- no AppPaths that exist on disk, and no /Applications
// guess that exists either -- resolves to "", the signal App.RemoveQuarantine
// uses to fail rather than silently falling through to acting on some
// unrelated, arbitrary path. This is the scoping behavior that closes off
// RemoveQuarantine trusting an arbitrary frontend-supplied path: since it now
// only ever operates on a path resolved through this function, a name that
// doesn't resolve can't result in any xattr call at all.
func TestResolveCaskAppPathUnmanagedFails(t *testing.T) {
	pkg := &BrewPackage{
		Name:     "not-actually-installed",
		FullName: "not-actually-installed",
		AppPaths: []string{"/nonexistent/path/Some.app"},
	}

	got := resolveCaskAppPath(pkg)
	if got != "" {
		t.Fatalf("resolveCaskAppPath() = %q, want empty string for an unresolvable cask", got)
	}
}
