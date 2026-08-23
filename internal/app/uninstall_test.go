package app

import (
	"reflect"
	"testing"
)

// TestBuildUninstallArgsAndTitle checks the shared args/title logic used by
// both Uninstall and UninstallElevated. It's split out specifically so a
// future change to one of those App methods can't silently drift from the
// other -- both call this same pure function, the "with administrator
// privileges" title suffix is the only intentional difference.
func TestBuildUninstallArgsAndTitle(t *testing.T) {
	tests := []struct {
		name      string
		pkg       string
		isCask    bool
		zap       bool
		force     bool
		elevated  bool
		wantArgs  []string
		wantTitle string
	}{
		{
			name:      "plain formula uninstall",
			pkg:       "wget",
			wantArgs:  []string{"uninstall", "wget"},
			wantTitle: "Uninstall wget",
		},
		{
			name:      "plain cask uninstall",
			pkg:       "firefox",
			isCask:    true,
			wantArgs:  []string{"uninstall", "--cask", "firefox"},
			wantTitle: "Uninstall firefox",
		},
		{
			name:      "cask uninstall with zap",
			pkg:       "firefox",
			isCask:    true,
			zap:       true,
			wantArgs:  []string{"uninstall", "--cask", "--zap", "firefox"},
			wantTitle: "Uninstall firefox (and its data)",
		},
		{
			name:      "force uninstall all versions",
			pkg:       "node",
			force:     true,
			wantArgs:  []string{"uninstall", "--force", "node"},
			wantTitle: "Uninstall node (all versions)",
		},
		{
			name:      "cask uninstall with zap and force",
			pkg:       "firefox",
			isCask:    true,
			zap:       true,
			force:     true,
			wantArgs:  []string{"uninstall", "--cask", "--zap", "--force", "firefox"},
			wantTitle: "Uninstall firefox (all versions, and its data)",
		},
		{
			// The --zap *flag* is only ever appended for casks (see the args
			// assertion below); the title wording doesn't special-case that,
			// since the frontend never actually offers a zap checkbox for a
			// formula uninstall in the first place.
			name:      "zap flag is only appended for casks",
			pkg:       "wget",
			isCask:    false,
			zap:       true,
			wantArgs:  []string{"uninstall", "wget"},
			wantTitle: "Uninstall wget (and its data)",
		},
		{
			name:      "elevated plain uninstall gets the admin-privileges title suffix",
			pkg:       "graalvm-jdk@21",
			isCask:    true,
			elevated:  true,
			wantArgs:  []string{"uninstall", "--cask", "graalvm-jdk@21"},
			wantTitle: "Uninstall graalvm-jdk@21 (with administrator privileges)",
		},
		{
			name:      "elevated zap+force uninstall composes both title suffixes",
			pkg:       "graalvm-jdk@21",
			isCask:    true,
			zap:       true,
			force:     true,
			elevated:  true,
			wantArgs:  []string{"uninstall", "--cask", "--zap", "--force", "graalvm-jdk@21"},
			wantTitle: "Uninstall graalvm-jdk@21 (all versions, and its data, with administrator privileges)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotArgs, gotTitle := buildUninstallArgsAndTitle(tt.pkg, tt.isCask, tt.zap, tt.force, tt.elevated)
			if !reflect.DeepEqual(gotArgs, tt.wantArgs) {
				t.Errorf("args = %v, want %v", gotArgs, tt.wantArgs)
			}
			if gotTitle != tt.wantTitle {
				t.Errorf("title = %q, want %q", gotTitle, tt.wantTitle)
			}
		})
	}
}

// TestUninstallAndUninstallElevatedAgreeExceptForTitle guards that the two
// App methods really do stay in lock-step apart from the elevated flag --
// i.e. that buildUninstallArgsAndTitle's elevated parameter only ever
// changes the title, never the argv Homebrew actually receives.
func TestUninstallAndUninstallElevatedAgreeExceptForTitle(t *testing.T) {
	plainArgs, plainTitle := buildUninstallArgsAndTitle("temurin", true, true, false, false)
	elevatedArgs, elevatedTitle := buildUninstallArgsAndTitle("temurin", true, true, false, true)

	if !reflect.DeepEqual(plainArgs, elevatedArgs) {
		t.Errorf("elevated=false args = %v, elevated=true args = %v, want identical argv", plainArgs, elevatedArgs)
	}
	if elevatedTitle == plainTitle {
		t.Errorf("expected the elevated title to differ from the plain one, both were %q", plainTitle)
	}
}
