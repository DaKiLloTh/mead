package brew

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestBuildSystemInfo_Success(t *testing.T) {
	base := &SystemInfo{
		BrewPath:    "/opt/homebrew/bin/brew",
		BrewVersion: "Homebrew 4.0.0",
		Prefix:      "/opt/homebrew",
		Cellar:      "/opt/homebrew/Cellar",
		Caskroom:    "/opt/homebrew/Caskroom",
	}
	installed := []BrewPackage{
		{Name: "wget", IsCask: false},
		{Name: "git", IsCask: false, Deprecated: true},
		{Name: "firefox", IsCask: true},
		{Name: "docker", IsCask: true, Disabled: true},
		{Name: "python@3.9", IsCask: false, Pinned: true},
	}
	outdated := []OutdatedPackage{
		{Name: "wget"},
		{Name: "firefox"},
	}

	info, err := buildSystemInfo(base, installed, nil, outdated, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}

	if info.InstalledForm != 3 {
		t.Errorf("InstalledForm = %d, want 3", info.InstalledForm)
	}
	if info.InstalledCask != 2 {
		t.Errorf("InstalledCask = %d, want 2", info.InstalledCask)
	}
	if info.OutdatedCount != 2 {
		t.Errorf("OutdatedCount = %d, want 2", info.OutdatedCount)
	}
	if info.DeprecatedCount != 1 {
		t.Errorf("DeprecatedCount = %d, want 1", info.DeprecatedCount)
	}
	if info.DisabledCount != 1 {
		t.Errorf("DisabledCount = %d, want 1", info.DisabledCount)
	}
	if info.PinnedCount != 1 {
		t.Errorf("PinnedCount = %d, want 1", info.PinnedCount)
	}

	// Base fields should pass through untouched.
	if info.BrewPath != base.BrewPath || info.BrewVersion != base.BrewVersion || info.Prefix != base.Prefix {
		t.Errorf("base fields not preserved: got %+v", info)
	}
}

func TestBuildSystemInfo_EmptySystem(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}

	info, err := buildSystemInfo(base, []BrewPackage{}, nil, []OutdatedPackage{}, nil)
	if err != nil {
		t.Fatalf("expected no error for a genuinely empty system, got %v", err)
	}
	if info.InstalledForm != 0 || info.InstalledCask != 0 || info.OutdatedCount != 0 {
		t.Errorf("expected all-zero counts for empty system, got %+v", info)
	}
}

func TestBuildSystemInfo_ListInstalledError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: command not found")

	info, err := buildSystemInfo(base, nil, wantErr, []OutdatedPackage{}, nil)
	if err == nil {
		t.Fatal("expected an error when ListInstalled fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_OutdatedError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: timeout")
	installed := []BrewPackage{{Name: "wget"}}

	info, err := buildSystemInfo(base, installed, nil, nil, wantErr)
	if err == nil {
		t.Fatal("expected an error when Outdated fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_BothFail_ListInstalledErrorTakesPrecedence(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	listErr := errors.New("list failed")
	outdatedErr := errors.New("outdated failed")

	_, err := buildSystemInfo(base, nil, listErr, nil, outdatedErr)
	if err == nil {
		t.Fatal("expected an error when both sub-calls fail, got nil")
	}
	if !errors.Is(err, listErr) {
		t.Errorf("expected the ListInstalled error to be the one surfaced, got %v", err)
	}
}

func TestDirSize_NormalCase(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello"), 0o644); err != nil { // 5 bytes
		t.Fatalf("writing a.txt: %v", err)
	}
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("mkdir sub: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sub, "b.txt"), []byte("world!"), 0o644); err != nil { // 6 bytes
		t.Fatalf("writing b.txt: %v", err)
	}

	size, err := dirSize(dir)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if want := int64(5 + 6); size != want {
		t.Errorf("dirSize = %d, want %d", size, want)
	}
}

func TestDirSize_NonexistentPath(t *testing.T) {
	// A missing root (e.g. brew's cache directory before anything has ever
	// been downloaded) is a normal, healthy state -- it must report a clean
	// zero size, not an error, or GetCacheInfo would show an error banner
	// for a perfectly ordinary fresh install.
	missing := filepath.Join(t.TempDir(), "does-not-exist")

	size, err := dirSize(missing)
	if err != nil {
		t.Fatalf("expected no error for a nonexistent path, got %v", err)
	}
	if size != 0 {
		t.Errorf("dirSize = %d, want 0", size)
	}
}

func TestDirSize_PermissionDenied(t *testing.T) {
	// Permission-denied handling is only reliably exercisable on POSIX
	// filesystems, and not at all when running as root (root bypasses the
	// permission bits, so the walk would succeed and this test would
	// spuriously fail) -- e.g. it's common for CI containers to run as
	// root. Skip in those cases rather than forcing something brittle.
	if runtime.GOOS == "windows" {
		t.Skip("permission bits aren't enforced the same way on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("running as root bypasses permission checks")
	}

	dir := t.TempDir()
	locked := filepath.Join(dir, "locked")
	if err := os.Mkdir(locked, 0o755); err != nil {
		t.Fatalf("mkdir locked: %v", err)
	}
	if err := os.WriteFile(filepath.Join(locked, "secret.txt"), []byte("x"), 0o644); err != nil {
		t.Fatalf("writing secret.txt: %v", err)
	}
	if err := os.Chmod(locked, 0o000); err != nil {
		t.Fatalf("chmod locked: %v", err)
	}
	t.Cleanup(func() {
		// Restore permissions so t.TempDir()'s own cleanup can remove it.
		_ = os.Chmod(locked, 0o755)
	})

	_, err := dirSize(dir)
	if err == nil {
		t.Fatal("expected an error walking into a permission-denied subdirectory, got nil")
	}
}

func TestCaskToPackage_FullName(t *testing.T) {
	tests := []struct {
		name     string
		cask     map[string]any
		wantFull string
		desc     string
	}{
		{
			name: "normal display name overrides full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{"Firefox"},
			},
			wantFull: "Firefox",
			desc:     "a real, non-empty name[0] should be preferred over full_token",
		},
		{
			name: "empty string name falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{""},
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "name[0] == \"\" must not clobber the valid full_token-derived FullName",
		},
		{
			name: "whitespace-only name falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{"   "},
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "a whitespace-only name[0] is effectively empty and must not clobber FullName",
		},
		{
			name: "no name field falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "matches current behavior when brew's JSON omits \"name\" entirely",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := caskToPackage(tt.cask)
			if p.FullName != tt.wantFull {
				t.Errorf("%s: FullName = %q, want %q (%s)", tt.name, p.FullName, tt.wantFull, tt.desc)
			}
		})
	}
}
