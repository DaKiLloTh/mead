package brew

import (
	"slices"
	"strings"
	"testing"
)

// Regression test for mead reporting mas as "not installed" when it
// genuinely is: mas is a regular Homebrew formula, so it lives at the same
// prefix as `brew` itself, not necessarily anywhere a GUI app's restricted
// default PATH (Finder/Dock/LaunchServices launches don't inherit the
// user's shell PATH) would find it via a bare PATH lookup.
func TestMasPathCandidatesCheckHomebrewPrefixesBeforePath(t *testing.T) {
	candidates := masPathCandidates()

	if len(candidates) == 0 {
		t.Fatal("masPathCandidates() returned no candidates")
	}
	for _, want := range []string{"/opt/homebrew/bin/mas", "/usr/local/bin/mas"} {
		if !slices.Contains(candidates, want) {
			t.Errorf("masPathCandidates() = %v, want it to contain %q", candidates, want)
		}
	}
	for _, c := range candidates {
		if !strings.HasSuffix(c, "/mas") {
			t.Errorf("candidate %q doesn't point at a `mas` binary", c)
		}
	}
}

func TestValidName(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		// Valid: simple formula/cask names.
		{"simple formula name", "wget", false},
		{"simple cask name", "firefox", false},
		{"hyphenated name", "google-chrome", false},
		{"underscored name", "some_formula", false},

		// Valid: versioned formulae.
		{"versioned formula", "node@18", false},
		{"versioned formula with dotted version", "openssl@1.1", false},
		{"versioned formula with dotted underscored name", "python@3.9", false},

		// Valid: tap-qualified names and tap names.
		{"two-segment tap name", "homebrew/cask", false},
		{"three-segment tap-qualified formula", "user/tap/formula-name", false},
		{"tap-qualified versioned formula", "user/tap/node@18", false},

		// Invalid: empty / malformed.
		{"empty string", "", true},
		{"leading dash", "-flag", true},
		{"leading dot", ".hidden", true},

		// Invalid: path traversal via "..".
		{"bare double-dot", "..", true},
		{"double-dot segment", "git/../../etc", true},
		{"trailing double-dot segment", "foo/..", true},
		{"double-dot embedded in a name", "foo..bar", true},

		// Invalid: slash edge cases.
		{"leading slash", "/etc/passwd", true},
		{"trailing slash", "foo/", true},
		{"double slash (empty segment)", "foo//bar", true},
		{"trailing double slash", "foo//", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidName(tt.input)
			if tt.wantErr && err == nil {
				t.Errorf("ValidName(%q) = nil, want error", tt.input)
			}
			if !tt.wantErr && err != nil {
				t.Errorf("ValidName(%q) = %v, want nil", tt.input, err)
			}
		})
	}
}
