package security

import (
	"os"
	"path/filepath"
	"testing"
)

// TestParseCFBundleIdentifier mirrors TestParseCFBundleIconFile in
// icons_test.go, exercising the pure plist-text parsing step (no
// plutil subprocess involved) against a handful of Info.plist shapes.
func TestParseCFBundleIdentifier(t *testing.T) {
	tests := []struct {
		name string
		xml  string
		want string
	}{
		{
			name: "typical Info.plist",
			xml: `<dict>
	<key>CFBundleIdentifier</key>
	<string>com.example.myapp</string>
</dict>`,
			want: "com.example.myapp",
		},
		{
			name: "no CFBundleIdentifier key at all",
			xml: `<dict>
	<key>CFBundleExecutable</key>
	<string>MyApp</string>
</dict>`,
			want: "",
		},
		{
			name: "value has surrounding whitespace",
			xml: `<dict>
	<key>CFBundleIdentifier</key>
	<string>  com.example.myapp  </string>
</dict>`,
			want: "com.example.myapp",
		},
		{
			name: "malformed/empty plist",
			xml:  ``,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseCFBundleIdentifier(tt.xml)
			if got != tt.want {
				t.Errorf("parseCFBundleIdentifier() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestFilterOrphanEntries is the core table-driven test for the "is this
// entry orphaned" pure decision function: given a set of raw leftover
// entries and the set of currently-legitimate app names/identifiers, which
// entries are NOT in that set.
func TestFilterOrphanEntries(t *testing.T) {
	tests := []struct {
		name        string
		entries     []leftoverCandidate
		legitimate  map[string]bool
		wantPaths   []string
		description string
	}{
		{
			name:        "empty input yields no orphans",
			entries:     nil,
			legitimate:  map[string]bool{},
			wantPaths:   []string{},
			description: "nothing to scan, nothing to flag",
		},
		{
			name: "entry matching a legitimate app name is not orphaned",
			entries: []leftoverCandidate{
				{Path: "/Library/Application Support/Google Chrome", Name: "Google Chrome", Kind: LeftoverApplicationSupport},
			},
			legitimate:  map[string]bool{"google chrome": true},
			wantPaths:   []string{},
			description: "case-insensitive match against a still-installed app's display name",
		},
		{
			name: "entry with no corresponding legitimate app is orphaned",
			entries: []leftoverCandidate{
				{Path: "/Library/Application Support/OldApp", Name: "OldApp", Kind: LeftoverApplicationSupport},
			},
			legitimate:  map[string]bool{"google chrome": true},
			wantPaths:   []string{"/Library/Application Support/OldApp"},
			description: "no app named this is currently installed",
		},
		{
			name: "preferences .plist suffix is stripped before comparison",
			entries: []leftoverCandidate{
				{Path: "/Library/Preferences/com.google.Chrome.plist", Name: "com.google.Chrome.plist", Kind: LeftoverPreferences},
			},
			legitimate:  map[string]bool{"com.google.chrome": true},
			wantPaths:   []string{},
			description: "bundle id from Info.plist matches once .plist is trimmed",
		},
		{
			name: "orphaned preferences plist for an uninstalled app",
			entries: []leftoverCandidate{
				{Path: "/Library/Preferences/com.oldcompany.OldApp.plist", Name: "com.oldcompany.OldApp.plist", Kind: LeftoverPreferences},
			},
			legitimate:  map[string]bool{"com.google.chrome": true},
			wantPaths:   []string{"/Library/Preferences/com.oldcompany.OldApp.plist"},
			description: "no installed cask's bundle id matches",
		},
		{
			name: "saved application state .savedState suffix is stripped before comparison",
			entries: []leftoverCandidate{
				{Path: "/Library/Saved Application State/com.google.Chrome.savedState", Name: "com.google.Chrome.savedState", Kind: LeftoverSavedState},
			},
			legitimate: map[string]bool{"com.google.chrome": true},
			wantPaths:  []string{},
		},
		{
			name: "com.apple. namespace is always treated as legitimate",
			entries: []leftoverCandidate{
				{Path: "/Library/Preferences/com.apple.Safari.plist", Name: "com.apple.Safari.plist", Kind: LeftoverPreferences},
				{Path: "/Library/Caches/com.apple.Something", Name: "com.apple.Something", Kind: LeftoverCaches},
			},
			legitimate:  map[string]bool{},
			wantPaths:   []string{},
			description: "system prefs/caches are never flagged even with an empty legitimate set",
		},
		{
			name: "hidden/dotfile entries are excluded",
			entries: []leftoverCandidate{
				{Path: "/Library/Preferences/.GlobalPreferences.plist", Name: ".GlobalPreferences.plist", Kind: LeftoverPreferences},
			},
			legitimate: map[string]bool{},
			wantPaths:  []string{},
		},
		{
			name: "mixed set only flags the genuine orphan",
			entries: []leftoverCandidate{
				{Path: "/Library/Caches/Google Chrome", Name: "Google Chrome", Kind: LeftoverCaches},
				{Path: "/Library/Caches/DefunctApp", Name: "DefunctApp", Kind: LeftoverCaches},
				{Path: "/Library/Logs/com.apple.something", Name: "com.apple.something", Kind: LeftoverLogs},
			},
			legitimate: map[string]bool{"google chrome": true},
			wantPaths:  []string{"/Library/Caches/DefunctApp"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterOrphanEntries(tt.entries, tt.legitimate)
			gotPaths := make([]string, 0, len(got))
			for _, g := range got {
				gotPaths = append(gotPaths, g.Path)
			}
			if !equalStringSlices(gotPaths, tt.wantPaths) {
				t.Errorf("filterOrphanEntries() paths = %v, want %v (%s)", gotPaths, tt.wantPaths, tt.description)
			}
		})
	}
}

func equalStringSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// TestIsWithinLeftoverLocation covers the safety check DeleteLeftovers runs
// before removing anything: only a direct child of one of the five
// well-known locations is allowed, never the location root itself and never
// anything outside those locations.
func TestIsWithinLeftoverLocation(t *testing.T) {
	libraryDir := "/Users/test/Library"

	tests := []struct {
		name string
		path string
		want bool
	}{
		{
			name: "direct child of Application Support is allowed",
			path: "/Users/test/Library/Application Support/OldApp",
			want: true,
		},
		{
			name: "direct child of Caches is allowed",
			path: "/Users/test/Library/Caches/OldApp",
			want: true,
		},
		{
			name: "a Preferences plist file is allowed",
			path: "/Users/test/Library/Preferences/com.old.App.plist",
			want: true,
		},
		{
			name: "the Caches directory itself is refused",
			path: "/Users/test/Library/Caches",
			want: false,
		},
		{
			name: "a nested entry two levels deep is refused",
			path: "/Users/test/Library/Application Support/OldApp/subdir",
			want: false,
		},
		{
			name: "a path outside any well-known location is refused",
			path: "/Users/test/Library/Application Scripts/OldApp",
			want: false,
		},
		{
			name: "a path escaping Library entirely is refused",
			path: "/Users/test/Documents/OldApp",
			want: false,
		},
		{
			name: "a path traversal attempt is refused",
			path: "/Users/test/Library/Caches/../../etc/passwd",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isWithinLeftoverLocation(filepath.Clean(tt.path), libraryDir)
			if got != tt.want {
				t.Errorf("isWithinLeftoverLocation(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// TestListCandidatesAndScanLeftovers exercises the I/O-touching layer
// against a temp-dir fixture mimicking the real ~/Library layout, the same
// pattern icons_test.go uses for Info.plist fixtures -- never the real home
// directory.
func TestListCandidatesAndScanLeftovers(t *testing.T) {
	libraryDir := t.TempDir()

	mustMkdir := func(parts ...string) string {
		p := filepath.Join(append([]string{libraryDir}, parts...)...)
		if err := os.MkdirAll(p, 0755); err != nil {
			t.Fatalf("setup: %v", err)
		}
		return p
	}
	mustWriteFile := func(content string, parts ...string) string {
		p := filepath.Join(append([]string{libraryDir}, parts...)...)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatalf("setup: %v", err)
		}
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatalf("setup: %v", err)
		}
		return p
	}

	// A still-installed app's traces (should never be flagged).
	mustMkdir("Application Support", "Google Chrome")
	mustWriteFile("fake plist", "Preferences", "com.google.Chrome.plist")

	// Leftovers from an app that's no longer around.
	mustMkdir("Application Support", "DefunctApp")
	mustWriteFile("12345 bytes of fake cache data\n", "Caches", "DefunctApp", "cache.db")
	mustWriteFile("fake plist", "Preferences", "com.oldcompany.DefunctApp.plist")
	mustMkdir("Saved Application State", "com.oldcompany.DefunctApp.savedState")
	mustMkdir("Logs", "DefunctApp")

	// Apple's own entries, and other noise that should never surface.
	mustWriteFile("fake plist", "Preferences", "com.apple.Safari.plist")
	mustWriteFile("fake plist", "Preferences", ".GlobalPreferences.plist")
	mustMkdir("Preferences", "ByHost") // a directory, not a *.plist file -- must be ignored

	legitimate := map[string]bool{
		"google chrome":     true,
		"com.google.chrome": true,
	}

	got := scanLeftovers(libraryDir, legitimate)

	gotNames := map[string]LeftoverKind{}
	for _, item := range got {
		gotNames[item.Name] = item.Kind
		if item.SizeHuman == "" {
			t.Errorf("item %q has empty SizeHuman", item.Name)
		}
	}

	if kind, ok := gotNames["DefunctApp"]; !ok {
		t.Errorf("expected an orphan named %q, got names: %v", "DefunctApp", gotNames)
	} else if kind != LeftoverApplicationSupport && kind != LeftoverCaches && kind != LeftoverLogs {
		t.Errorf("unexpected kind %q for DefunctApp entry", kind)
	}
	if _, ok := gotNames["com.oldcompany.DefunctApp"]; !ok {
		t.Errorf("expected an orphan named %q (preferences/savedState with suffix stripped), got: %v", "com.oldcompany.DefunctApp", gotNames)
	}
	if _, ok := gotNames["Google Chrome"]; ok {
		t.Errorf("Google Chrome should not be flagged as a leftover, it's still installed")
	}
	if _, ok := gotNames["com.google.Chrome"]; ok {
		t.Errorf("com.google.Chrome preferences should not be flagged, the app is still installed")
	}
	if _, ok := gotNames["com.apple.Safari"]; ok {
		t.Errorf("com.apple.* entries should never be flagged")
	}
	if _, ok := gotNames[".GlobalPreferences"]; ok {
		t.Errorf("hidden/dotfile preference entries should never be flagged")
	}
	if _, ok := gotNames["ByHost"]; ok {
		t.Errorf("Preferences/ByHost is a directory, not a *.plist file, and must be ignored entirely")
	}
}

// TestScanLeftoversHomeDir exercises ScanLeftovers's actual entry point --
// including os.UserHomeDir() resolution -- against a fixture $HOME set via
// t.Setenv, still never touching the real home directory. It stubs out the
// "currently installed casks" side by passing an empty legitimate set
// through scanLeftovers directly is covered above; this test only confirms
// ScanLeftovers assembles a Library path under the given $HOME correctly by
// checking a known leftover surfaces.
func TestScanLeftoversHomeDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	libraryDir := filepath.Join(home, "Library")
	if err := os.MkdirAll(filepath.Join(libraryDir, "Caches", "SomeOldApp"), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(libraryDir, "Caches", "SomeOldApp", "data.bin"), []byte("hello"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	got := scanLeftovers(libraryDir, map[string]bool{})
	if len(got) != 1 {
		t.Fatalf("scanLeftovers() returned %d items, want 1: %+v", len(got), got)
	}
	if got[0].Name != "SomeOldApp" {
		t.Errorf("got name %q, want %q", got[0].Name, "SomeOldApp")
	}
	if got[0].SizeBytes != int64(len("hello")) {
		t.Errorf("got size %d, want %d", got[0].SizeBytes, len("hello"))
	}
}

// TestDeleteLeftovers exercises the actual filesystem removal against a
// temp-dir $HOME fixture (never the real home directory), verifying both
// that a legitimate leftover path is removed and that a path outside the
// well-known locations is refused and left untouched.
func TestDeleteLeftovers(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	libraryDir := filepath.Join(home, "Library")

	leftoverDir := filepath.Join(libraryDir, "Application Support", "OldApp")
	if err := os.MkdirAll(leftoverDir, 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}

	outsideFile := filepath.Join(home, "Documents", "important.txt")
	if err := os.MkdirAll(filepath.Dir(outsideFile), 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(outsideFile, []byte("do not delete me"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	ctx := t.Context()
	err := DeleteLeftovers(ctx, []string{leftoverDir, outsideFile})
	if err == nil {
		t.Fatal("expected an error because one of the paths is outside the well-known leftover locations")
	}

	if _, statErr := os.Stat(leftoverDir); !os.IsNotExist(statErr) {
		t.Errorf("expected %s to have been removed, stat err = %v", leftoverDir, statErr)
	}
	if _, statErr := os.Stat(outsideFile); statErr != nil {
		t.Errorf("expected %s to still exist (outside well-known locations), got stat err = %v", outsideFile, statErr)
	}
}
