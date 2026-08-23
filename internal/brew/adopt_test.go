package brew

import (
	"reflect"
	"testing"
)

func TestSlugifyAppName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple", "Chrome.app", "chrome"},
		{"multi word", "Google Chrome.app", "google-chrome"},
		{"already hyphenated", "Visual Studio Code.app", "visual-studio-code"},
		{"punctuation collapses", "iTerm2.app", "iterm2"},
		{"trailing punctuation trimmed", "Docker Desktop!.app", "docker-desktop"},
		{"accented e", "Café.app", "cafe"},
		{"accented o umlaut mid-word", "Löve2D.app", "love2d"},
		{"accented at start", "Über.app", "uber"},
		{"multiple accents", "Café Déjà Vu.app", "cafe-deja-vu"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := slugifyAppName(tt.in)
			if got != tt.want {
				t.Errorf("slugifyAppName(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestSplitCamelCase(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"simple camel", "BambuStudio", "Bambu Studio"},
		{"already has space", "Google Chrome", "Google Chrome"},
		{"leading acronym word", "HTTPServer", "HTTP Server"},
		{"single word lower", "chrome", "chrome"},
		{"iTerm2 leading lowercase", "iTerm2", "i Term2"},
		{"digit then upper", "Löve2D", "Löve2D"},
		{"all caps no boundary", "NASA", "NASA"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitCamelCase(tt.in)
			if got != tt.want {
				t.Errorf("splitCamelCase(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestSlugVariants(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "bambu studio camelCase",
			in:   "BambuStudio.app",
			want: []string{"bambustudio", "bambu-studio"},
		},
		{
			name: "iTerm2 plain wins, no bogus split variant lost",
			in:   "iTerm2.app",
			want: []string{"iterm2", "i-term2"},
		},
		{
			name: "already spaced name has no extra variants",
			in:   "Google Chrome.app",
			want: []string{"google-chrome"},
		},
		{
			name: "ampersand expands to and",
			in:   "Bob & Bob.app",
			want: []string{"bob-bob", "bob-and-bob"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := slugVariants(tt.in)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("slugVariants(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestMatchCaskToken(t *testing.T) {
	knownTokens := map[string]bool{
		"bambu-studio":       true,
		"iterm2":             true,
		"google-chrome":      true,
		"visual-studio-code": true,
		"docker-desktop":     true,
	}

	t.Run("BambuStudio.app matches bambu-studio via camelCase variant, exact", func(t *testing.T) {
		token, exact, ok := matchCaskToken("BambuStudio.app", knownTokens)
		if !ok || !exact || token != "bambu-studio" {
			t.Errorf("matchCaskToken(BambuStudio.app) = (%q, %v, %v), want (bambu-studio, true, true)", token, exact, ok)
		}
	})

	t.Run("iTerm2.app still matches iterm2 exactly, unaffected by camelCase variant", func(t *testing.T) {
		token, exact, ok := matchCaskToken("iTerm2.app", knownTokens)
		if !ok || !exact || token != "iterm2" {
			t.Errorf("matchCaskToken(iTerm2.app) = (%q, %v, %v), want (iterm2, true, true)", token, exact, ok)
		}
	})

	t.Run("close misspelling falls through to fuzzy match", func(t *testing.T) {
		token, exact, ok := matchCaskToken("Dockr Desktop.app", knownTokens)
		if !ok || exact || token != "docker-desktop" {
			t.Errorf("matchCaskToken(Dockr Desktop.app) = (%q, %v, %v), want (docker-desktop, false, true)", token, exact, ok)
		}
	})

	t.Run("unrelated app name matches nothing", func(t *testing.T) {
		_, _, ok := matchCaskToken("MyCompanyInternalTool.app", knownTokens)
		if ok {
			t.Errorf("matchCaskToken(MyCompanyInternalTool.app) matched, want no match")
		}
	})

	// Regression: found live against a real /Applications directory. Short,
	// generic app names are only a single character away from unrelated
	// real cask tokens, so a fuzzy threshold that's too loose turns those
	// into false "possible match" candidates for a completely different
	// product. See fuzzyMatchThreshold's doc comment for the numbers.
	t.Run("short unrelated tokens one edit away don't false-positive", func(t *testing.T) {
		shortTokens := map[string]bool{
			"dockey":  true, // unrelated to Docker.app
			"ducker":  true, // ditto -- "docker" should never match "ducker" either
			"heynote": true, // unrelated to Keynote.app
			"zcode":   true, // unrelated to Xcode.app
		}
		for _, appDir := range []string{"Docker.app", "Keynote.app", "Xcode.app"} {
			if _, _, ok := matchCaskToken(appDir, shortTokens); ok {
				t.Errorf("matchCaskToken(%q) matched an unrelated short token, want no match", appDir)
			}
		}
	})
}

func TestBuildMatchConfidence(t *testing.T) {
	tests := []struct {
		name       string
		tokenExact bool
		appDir     string
		appPaths   []string
		wantConf   string
		wantReason string
	}{
		{
			name:       "BambuStudio exact token and exact artifact filename",
			tokenExact: true,
			appDir:     "BambuStudio.app",
			appPaths:   []string{"/Applications/BambuStudio.app"},
			wantConf:   "exact",
			wantReason: "",
		},
		{
			name:       "exact token but no artifacts to verify against",
			tokenExact: true,
			appDir:     "BambuStudio.app",
			appPaths:   nil,
			wantConf:   "possible",
			wantReason: "cask doesn't list an app filename to verify against",
		},
		{
			name:       "exact token but artifact filename differs",
			tokenExact: true,
			appDir:     "MyApplication.app",
			appPaths:   []string{"/Applications/My_Application.app"},
			wantConf:   "possible",
			wantReason: `cask installs "My_Application.app", found "MyApplication.app" here`,
		},
		{
			name:       "fuzzy token match with confirming artifact still possible",
			tokenExact: false,
			appDir:     "Dockr Desktop.app",
			appPaths:   []string{"/Applications/Dockr Desktop.app"},
			wantConf:   "possible",
			wantReason: "matched by name similarity, not an exact cask identifier",
		},
		{
			name:       "fuzzy token match and filename mismatch combine",
			tokenExact: false,
			appDir:     "Dockr Desktop.app",
			appPaths:   []string{"/Applications/Docker Desktop.app"},
			wantConf:   "possible",
			wantReason: `matched by name similarity, not an exact cask identifier; cask installs "Docker Desktop.app", found "Dockr Desktop.app" here`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			info := BrewPackage{AppPaths: tt.appPaths}
			gotConf, gotReason := buildMatchConfidence(tt.tokenExact, tt.appDir, info)
			if gotConf != tt.wantConf {
				t.Errorf("confidence = %q, want %q", gotConf, tt.wantConf)
			}
			if gotReason != tt.wantReason {
				t.Errorf("reason = %q, want %q", gotReason, tt.wantReason)
			}
		})
	}
}

func TestBatchSlugs(t *testing.T) {
	tests := []struct {
		name  string
		slugs []string
		size  int
		want  [][]string
	}{
		{
			name:  "empty input",
			slugs: nil,
			size:  10,
			want:  nil,
		},
		{
			name:  "fewer than one batch",
			slugs: []string{"a", "b", "c"},
			size:  10,
			want:  [][]string{{"a", "b", "c"}},
		},
		{
			name:  "exact multiple of batch size",
			slugs: []string{"a", "b", "c", "d"},
			size:  2,
			want:  [][]string{{"a", "b"}, {"c", "d"}},
		},
		{
			name:  "last partial batch",
			slugs: []string{"a", "b", "c", "d", "e"},
			size:  2,
			want:  [][]string{{"a", "b"}, {"c", "d"}, {"e"}},
		},
		{
			name:  "batch size of one",
			slugs: []string{"a", "b", "c"},
			size:  1,
			want:  [][]string{{"a"}, {"b"}, {"c"}},
		},
		{
			name:  "batch size larger than input",
			slugs: []string{"a"},
			size:  25,
			want:  [][]string{{"a"}},
		},
		{
			name:  "zero size treated as one batch",
			slugs: []string{"a", "b", "c"},
			size:  0,
			want:  [][]string{{"a", "b", "c"}},
		},
		{
			name:  "negative size treated as one batch",
			slugs: []string{"a", "b", "c"},
			size:  -1,
			want:  [][]string{{"a", "b", "c"}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := batchSlugs(tt.slugs, tt.size)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("batchSlugs(%v, %d) = %v, want %v", tt.slugs, tt.size, got, tt.want)
			}
		})
	}
}
