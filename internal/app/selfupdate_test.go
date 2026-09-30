package app

import "testing"

func TestDeriveBundlePath(t *testing.T) {
	tests := []struct {
		name    string
		exePath string
		want    string
		wantErr bool
	}{
		{
			name:    "a real installed bundle layout",
			exePath: "/Applications/mead.app/Contents/MacOS/mead",
			want:    "/Applications/mead.app",
		},
		{
			name:    "a bundle installed somewhere other than /Applications",
			exePath: "/Users/dan/Downloads/mead.app/Contents/MacOS/mead",
			want:    "/Users/dan/Downloads/mead.app",
		},
		{
			name:    "wails dev's own build output, not a real bundle",
			exePath: "/Users/dan/Code/mead/build/bin/mead.app/Contents/MacOS/mead",
			want:    "/Users/dan/Code/mead/build/bin/mead.app",
		},
		{
			name:    "a bare go run/go build binary outside any bundle",
			exePath: "/var/folders/xy/T/go-build12345/b001/exe/mead",
			wantErr: true,
		},
		{
			name:    "missing the MacOS directory segment",
			exePath: "/Applications/mead.app/Contents/mead",
			wantErr: true,
		},
		{
			name:    "the executable's grandparent doesn't end in .app",
			exePath: "/Applications/mead-not-a-bundle/Contents/MacOS/mead",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := deriveBundlePath(tt.exePath)
			if tt.wantErr {
				if err == nil {
					t.Errorf("deriveBundlePath(%q) = %q, nil, want an error", tt.exePath, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("deriveBundlePath(%q) error = %v, want nil", tt.exePath, err)
			}
			if got != tt.want {
				t.Errorf("deriveBundlePath(%q) = %q, want %q", tt.exePath, got, tt.want)
			}
		})
	}
}

func TestUpdateAvailable(t *testing.T) {
	tests := []struct {
		name    string
		running string
		onDisk  string
		want    string
	}{
		{"versions match: nothing to report", "0.10.3", "0.10.3", ""},
		{"a genuinely newer version on disk", "0.10.3", "0.10.4", "0.10.4"},
		{"on-disk version couldn't be determined", "0.10.3", "", ""},
		{"a dev build never reports an update, even with a mismatched on-disk version", "dev", "0.10.4", ""},
		{"a dev build with no on-disk version either", "dev", "", ""},
		{"on-disk somehow reports an older version than running -- still surfaced as different, not judged", "0.10.4", "0.10.3", "0.10.3"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := updateAvailable(tt.running, tt.onDisk)
			if got != tt.want {
				t.Errorf("updateAvailable(%q, %q) = %q, want %q", tt.running, tt.onDisk, got, tt.want)
			}
		})
	}
}

func TestRestartArgs(t *testing.T) {
	got := restartArgs("/Applications/mead.app")
	want := []string{"-n", "/Applications/mead.app"}
	if len(got) != len(want) {
		t.Fatalf("restartArgs(...) = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("restartArgs(...)[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	// "-n" (always start a new instance) must come before the bundle path
	// for `open` to parse it as a flag rather than a second target -- this
	// is the specific property that matters here, not just "both present
	// somewhere".
	if got[0] != "-n" {
		t.Errorf("restartArgs(...) = %v, want \"-n\" first so `open` parses it as a flag", got)
	}
}

// UpdateAvailable and RestartApp themselves aren't unit tested here: they
// wrap real I/O (os.Executable, plutil via brew.ReadInstalledAppVersion,
// spawning `open`, and Wails' runtime.Quit, which calls log.Fatal if the
// context wasn't set up by a real Wails app -- as it isn't in a test
// binary) the same way the rest of this package tests the pure decision
// functions behind its App methods (see mas_test.go's
// TestBuildMasUpgradeArgs / TestBuildMasUpgradeTitle for the same split)
// rather than the methods that perform the actual process/exec calls.
