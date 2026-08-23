package security

import (
	"os"
	"path/filepath"
	"testing"
)

// TestParseCFBundleIconFile exercises the pure plist-text parsing step of
// icon extraction (no plutil/sips subprocess involved) against a handful of
// Info.plist shapes real app bundles ship with.
func TestParseCFBundleIconFile(t *testing.T) {
	tests := []struct {
		name string
		xml  string
		want string
	}{
		{
			name: "icon file without extension",
			xml: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>MyApp</string>
	<key>CFBundleIconFile</key>
	<string>AppIcon</string>
	<key>CFBundleIdentifier</key>
	<string>com.example.myapp</string>
</dict>
</plist>`,
			want: "AppIcon",
		},
		{
			name: "icon file with .icns extension already present",
			xml: `<dict>
	<key>CFBundleIconFile</key>
	<string>AppIcon.icns</string>
</dict>`,
			want: "AppIcon.icns",
		},
		{
			name: "no CFBundleIconFile key at all",
			xml: `<dict>
	<key>CFBundleExecutable</key>
	<string>MyApp</string>
</dict>`,
			want: "",
		},
		{
			name: "CFBundleIconFile present but empty",
			xml: `<dict>
	<key>CFBundleIconFile</key>
	<string></string>
</dict>`,
			want: "",
		},
		{
			name: "whitespace around the value is trimmed",
			xml: `<dict>
	<key>CFBundleIconFile</key>
	<string>  AppIcon  </string>
</dict>`,
			want: "AppIcon",
		},
		{
			name: "malformed/empty plist",
			xml:  ``,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseCFBundleIconFile(tt.xml)
			if got != tt.want {
				t.Errorf("parseCFBundleIconFile() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestResolveIconFilePath covers the filename-resolution logic (with vs.
// without the .icns extension already present) against a fake bundle
// structure in a temp dir -- no real .icns content needed since this step
// never reads the file, only stats it.
func TestResolveIconFilePath(t *testing.T) {
	t.Run("extension already present and file exists", func(t *testing.T) {
		appPath := t.TempDir()
		resourcesDir := filepath.Join(appPath, "Contents", "Resources")
		if err := os.MkdirAll(resourcesDir, 0755); err != nil {
			t.Fatalf("setup: %v", err)
		}
		icnsPath := filepath.Join(resourcesDir, "AppIcon.icns")
		if err := os.WriteFile(icnsPath, []byte("fake icns bytes"), 0644); err != nil {
			t.Fatalf("setup: %v", err)
		}

		got, err := resolveIconFilePath(appPath, "AppIcon.icns")
		if err != nil {
			t.Fatalf("resolveIconFilePath() error = %v", err)
		}
		if got != icnsPath {
			t.Errorf("resolveIconFilePath() = %q, want %q", got, icnsPath)
		}
	})

	t.Run("extension missing from CFBundleIconFile value is appended", func(t *testing.T) {
		appPath := t.TempDir()
		resourcesDir := filepath.Join(appPath, "Contents", "Resources")
		if err := os.MkdirAll(resourcesDir, 0755); err != nil {
			t.Fatalf("setup: %v", err)
		}
		icnsPath := filepath.Join(resourcesDir, "AppIcon.icns")
		if err := os.WriteFile(icnsPath, []byte("fake icns bytes"), 0644); err != nil {
			t.Fatalf("setup: %v", err)
		}

		got, err := resolveIconFilePath(appPath, "AppIcon")
		if err != nil {
			t.Fatalf("resolveIconFilePath() error = %v", err)
		}
		if got != icnsPath {
			t.Errorf("resolveIconFilePath() = %q, want %q", got, icnsPath)
		}
	})

	t.Run("icon file doesn't exist on disk", func(t *testing.T) {
		appPath := t.TempDir()
		if _, err := resolveIconFilePath(appPath, "Missing"); err == nil {
			t.Error("expected an error for a nonexistent icon file, got nil")
		}
	})

	t.Run("empty CFBundleIconFile value", func(t *testing.T) {
		appPath := t.TempDir()
		if _, err := resolveIconFilePath(appPath, ""); err == nil {
			t.Error("expected an error for an empty icon file value, got nil")
		}
	})
}

// TestExtractAppIconMissingAppFailsGracefully verifies the top-level
// extraction entry point returns a plain error -- never panics -- for
// inputs a real installed cask could plausibly produce: no app path, and an
// app bundle with no Info.plist at all.
func TestExtractAppIconMissingAppFailsGracefully(t *testing.T) {
	ctx := t.Context()

	t.Run("empty app path", func(t *testing.T) {
		if _, err := ExtractAppIcon(ctx, ""); err == nil {
			t.Error("expected an error for an empty app path, got nil")
		}
	})

	t.Run("app bundle with no Info.plist", func(t *testing.T) {
		appPath := t.TempDir()
		if _, err := ExtractAppIcon(ctx, appPath); err == nil {
			t.Error("expected an error for a bundle with no Info.plist, got nil")
		}
	})
}

// TestOpenAppMissingPath verifies OpenApp fails gracefully (a plain error,
// no subprocess launched) for paths that don't resolve to anything on
// disk, mirroring RevealInFinder's existing guard.
func TestOpenAppMissingPath(t *testing.T) {
	ctx := t.Context()

	if _, err := os.Stat("/nonexistent/Some.app"); err == nil {
		t.Fatal("test assumption violated: /nonexistent/Some.app unexpectedly exists")
	}

	if err := OpenApp(ctx, ""); err == nil {
		t.Error("expected an error for an empty path, got nil")
	}
	if err := OpenApp(ctx, "/nonexistent/Some.app"); err == nil {
		t.Error("expected an error for a nonexistent path, got nil")
	}
}
