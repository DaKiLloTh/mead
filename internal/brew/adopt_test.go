package brew

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
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

func TestIsAppStoreApp(t *testing.T) {
	masApp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(masApp, "Contents", "_MASReceipt"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(masApp, "Contents", "_MASReceipt", "receipt"), []byte("receipt"), 0o644); err != nil {
		t.Fatal(err)
	}

	directApp := t.TempDir()
	if err := os.MkdirAll(filepath.Join(directApp, "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}

	missingApp := filepath.Join(t.TempDir(), "DoesNotExist.app")

	tests := []struct {
		name    string
		appPath string
		want    bool
	}{
		{"has MAS receipt", masApp, true},
		{"no MAS receipt", directApp, false},
		{"app path doesn't exist", missingApp, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isAppStoreApp(tt.appPath); got != tt.want {
				t.Errorf("isAppStoreApp(%q) = %v, want %v", tt.appPath, got, tt.want)
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

func fakeCaskTokens(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("cask-%d", i)
	}
	return out
}

func TestCheckCaskListComplete(t *testing.T) {
	tokens := fakeCaskTokens
	tests := []struct {
		name    string
		tokens  []string
		wantErr bool
	}{
		{"nil list", nil, true},
		{"only locally tapped casks", []string{"dakilloth/mead/mead", "mead"}, true},
		{"just under the floor", tokens(minPlausibleCaskCount - 1), true},
		{"at the floor", tokens(minPlausibleCaskCount), false},
		{"a real-sized list", tokens(7743), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := checkCaskListComplete(tt.tokens)
			if (err != nil) != tt.wantErr {
				t.Fatalf("checkCaskListComplete(%d tokens) error = %v, wantErr %v", len(tt.tokens), err, tt.wantErr)
			}
			if err != nil && err != errCaskListIncomplete {
				t.Errorf("error = %v, want errCaskListIncomplete", err)
			}
		})
	}
}

func TestKnownCasks(t *testing.T) {
	stub := []string{"dakilloth/mead/mead", "mead"}
	full := fakeCaskTokens(7743)
	boom := errors.New("boom")

	// listSeq returns each result in turn, one per call.
	type listResult struct {
		tokens []string
		err    error
	}
	run := func(lists []listResult, rebuildErr error) (got []string, err error, listCalls, rebuildCalls int) {
		list := func() ([]string, error) {
			r := lists[listCalls]
			listCalls++
			return r.tokens, r.err
		}
		rebuild := func() error {
			rebuildCalls++
			return rebuildErr
		}
		got, err = knownCasks(list, rebuild)
		return
	}

	t.Run("complete list is returned without rebuilding", func(t *testing.T) {
		got, err, lists, rebuilds := run([]listResult{{full, nil}}, nil)
		if err != nil || len(got) != len(full) || lists != 1 || rebuilds != 0 {
			t.Fatalf("got %d tokens, err %v, %d lists, %d rebuilds", len(got), err, lists, rebuilds)
		}
	})

	t.Run("stub list is rebuilt once and re-read", func(t *testing.T) {
		got, err, lists, rebuilds := run([]listResult{{stub, nil}, {full, nil}}, nil)
		if err != nil || len(got) != len(full) || lists != 2 || rebuilds != 1 {
			t.Fatalf("got %d tokens, err %v, %d lists, %d rebuilds", len(got), err, lists, rebuilds)
		}
	})

	t.Run("still a stub after rebuilding is an error, not a retry loop", func(t *testing.T) {
		_, err, lists, rebuilds := run([]listResult{{stub, nil}, {stub, nil}}, nil)
		if !errors.Is(err, errCaskListIncomplete) || lists != 2 || rebuilds != 1 {
			t.Fatalf("err %v, %d lists, %d rebuilds", err, lists, rebuilds)
		}
	})

	t.Run("a failed rebuild reports the incomplete list and why", func(t *testing.T) {
		_, err, lists, rebuilds := run([]listResult{{stub, nil}}, boom)
		if !errors.Is(err, errCaskListIncomplete) || !strings.Contains(err.Error(), "boom") || lists != 1 || rebuilds != 1 {
			t.Fatalf("err %v, %d lists, %d rebuilds", err, lists, rebuilds)
		}
	})

	t.Run("a listing error is returned as is, with no rebuild", func(t *testing.T) {
		_, err, _, rebuilds := run([]listResult{{nil, boom}}, nil)
		if err != boom || rebuilds != 0 {
			t.Fatalf("err %v, %d rebuilds", err, rebuilds)
		}
	})

	t.Run("a listing error after rebuilding is returned as is", func(t *testing.T) {
		_, err, _, _ := run([]listResult{{stub, nil}, {nil, boom}}, nil)
		if err != boom {
			t.Fatalf("err %v", err)
		}
	})
}

// Real `codesign -dvv` output, trimmed to the lines that matter, from an App
// Store build with no _MASReceipt in its bundle (Windows App 11.4.2) and from
// a direct download (Discord).
const codesignMacAppStoreOutput = `Executable=/Applications/Windows App.app/Contents/MacOS/Windows App
Identifier=com.microsoft.rdc.macos
Signature size=4710
Authority=Apple Mac OS Application Signing
Authority=Apple Worldwide Developer Relations Certification Authority
Authority=Apple Root CA
TeamIdentifier=UBF8T346G9
`

const codesignDeveloperIDOutput = `Executable=/Applications/Discord.app/Contents/MacOS/Discord
Identifier=com.hnc.Discord
Signature size=8977
Authority=Developer ID Application: Discord, Inc. (53Q6R32WPB)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
TeamIdentifier=53Q6R32WPB
`

func TestSignedForMacAppStore(t *testing.T) {
	tests := []struct {
		name string
		out  string
		want bool
	}{
		{"Mac App Store build", codesignMacAppStoreOutput, true},
		{"Developer ID build", codesignDeveloperIDOutput, false},
		{"empty output", "", false},
		{"unreadable bundle", "/tmp/x.app: bundle format unrecognized, invalid, or unsuitable\n", false},
		{"authority text inside another line is not enough", "Note=Authority=Apple Mac OS Application Signing\n", false},
		{"surrounding whitespace and CRLF", "  Authority=Apple Mac OS Application Signing\r\n", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := signedForMacAppStore(tt.out); got != tt.want {
				t.Errorf("signedForMacAppStore() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDetectAppStoreApp(t *testing.T) {
	withReceipt := t.TempDir()
	if err := os.MkdirAll(filepath.Join(withReceipt, "Contents", "_MASReceipt"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(withReceipt, "Contents", "_MASReceipt", "receipt"), []byte("r"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Run("a receipt is enough, without consulting codesign", func(t *testing.T) {
		if !detectAppStoreApp(context.Background(), withReceipt) {
			t.Error("detectAppStoreApp() = false for a bundle with a receipt")
		}
	})

	t.Run("no receipt and nothing codesign can read is not an App Store app", func(t *testing.T) {
		if detectAppStoreApp(context.Background(), t.TempDir()) {
			t.Error("detectAppStoreApp() = true for an empty directory")
		}
	})

	t.Run("a path that does not exist is not an App Store app", func(t *testing.T) {
		if detectAppStoreApp(context.Background(), filepath.Join(t.TempDir(), "Nope.app")) {
			t.Error("detectAppStoreApp() = true for a missing path")
		}
	})
}
