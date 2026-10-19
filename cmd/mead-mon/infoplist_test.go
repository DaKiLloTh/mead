package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Info.plist is copied into mead.app/Contents/Library/LoginItems/mead-mon.app
// by scripts/bundle-menubar.sh. Its own identity is what keeps mead-mon out
// of the Dock and stops `open -a mead` mistaking it for mead.
func TestInfoPlist(t *testing.T) {
	if _, err := exec.LookPath("plutil"); err != nil {
		t.Skip("plutil not available")
	}
	raw, err := os.ReadFile("Info.plist")
	if err != nil {
		t.Fatal(err)
	}
	f := filepath.Join(t.TempDir(), "Info.plist")
	if err := os.WriteFile(f, []byte(strings.ReplaceAll(string(raw), "{{VERSION}}", "1.2.3")), 0o644); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("plutil", "-convert", "json", "-o", "-", f).Output()
	if err != nil {
		t.Fatalf("plutil: %v", err)
	}
	var p map[string]any
	if err := json.Unmarshal(out, &p); err != nil {
		t.Fatal(err)
	}
	for key, want := range map[string]any{
		"CFBundleExecutable":         "mead-mon",
		"CFBundleIdentifier":         "app.mead.menubar",
		"CFBundlePackageType":        "APPL",
		"CFBundleShortVersionString": "1.2.3",
		"LSUIElement":                true,
	} {
		if p[key] != want {
			t.Errorf("%s = %v, want %v", key, p[key], want)
		}
	}
}
