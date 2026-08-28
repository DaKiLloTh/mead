package brew

import "testing"

func TestMatchTier(t *testing.T) {
	tests := []struct {
		name  string
		input string
		query string
		want  int
	}{
		{"exact match", "blender", "blender", 0},
		{"exact match is case-insensitive", "Blender", "blender", 0},
		{"prefix match", "blender-benchmark", "blender", 1},
		{"substring match", "the-blender-app", "blender", 2},
		{"unrelated fuzzy leftover", "bender", "blender", 3},
		{"another unrelated fuzzy leftover", "render", "blender", 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchTier(tt.input, tt.query); got != tt.want {
				t.Errorf("matchTier(%q, %q) = %d, want %d", tt.input, tt.query, got, tt.want)
			}
		})
	}
}

// TestRankResultsBlenderRepro is the exact real-world case from issue #136:
// `brew search --formula blender` returns "bender"/"render" (neither of
// which even contains "blender"), `brew search --cask blender` returns
// "blender"/"blender-benchmark"/"blender@lts". The old code concatenated
// formula results before cask results with no relevance signal at all, so
// "bender" and "render" ranked above the exact match. rankResults must fix
// that regardless of which list a result came from.
func TestRankResultsBlenderRepro(t *testing.T) {
	results := []SearchResult{
		{Name: "bender", IsCask: false},
		{Name: "render", IsCask: false},
		{Name: "blender", IsCask: true},
		{Name: "blender-benchmark", IsCask: true},
		{Name: "blender@lts", IsCask: true},
	}

	rankResults(results, "blender")

	if results[0].Name != "blender" {
		t.Fatalf("rankResults()[0].Name = %q, want %q (the exact match must rank first)", results[0].Name, "blender")
	}

	// The exact match's tier-0 rank must beat every tier-3 fuzzy leftover,
	// not just the first one -- verify none of the unrelated formula
	// matches sneak in ahead of any of the real blender casks.
	blenderIdx := map[string]int{}
	for i, r := range results {
		blenderIdx[r.Name] = i
	}
	for _, fuzzy := range []string{"bender", "render"} {
		for _, real := range []string{"blender", "blender-benchmark", "blender@lts"} {
			if blenderIdx[fuzzy] < blenderIdx[real] {
				t.Errorf("unrelated fuzzy match %q ranked above real match %q", fuzzy, real)
			}
		}
	}
}

func TestRankResultsPreservesRelativeOrderWithinATier(t *testing.T) {
	// Two results in the same tier (both substring matches, tier 2) with
	// otherwise-equal similarity: rankResults must not reorder them
	// arbitrarily, since sort.SliceStable is the whole point of using a
	// stable sort here.
	results := []SearchResult{
		{Name: "aaa-tool-zzz"},
		{Name: "bbb-tool-yyy"},
	}
	rankResults(results, "tool")

	if results[0].Name != "aaa-tool-zzz" || results[1].Name != "bbb-tool-yyy" {
		t.Errorf("rankResults() reordered same-tier, same-similarity results: got %v", results)
	}
}

// TestAddToInfoIndexThirdPartyTap is a real-world regression case: a cask
// installed from a third-party tap (this repo's own mead cask, from
// dakilloth/mead). `brew search` returns the tap-qualified name
// ("dakilloth/mead/mead") for anything outside the default tap, but
// `brew info`'s own token/name field is always the short, unqualified one
// ("mead") regardless of which tap it came from. addToInfoIndex must index
// under both forms, or a lookup keyed by the tap-qualified search result
// name misses entirely -- exactly what happened before this was caught
// live: the mead cask's own search card silently showed no description,
// version, or tap badge.
func TestAddToInfoIndexThirdPartyTap(t *testing.T) {
	pkg := BrewPackage{
		Name:     "mead",
		FullName: "mead", // caskToPackage overwrites this with the pretty display name, see its own test
		IsCask:   true,
		Tap:      "dakilloth/mead",
		Desc:     "Native Homebrew GUI for macOS",
		Version:  "0.9.0",
	}

	index := map[string]BrewPackage{}
	addToInfoIndex(index, []BrewPackage{pkg})

	got, ok := index[searchKey("dakilloth/mead/mead", true)]
	if !ok {
		t.Fatal("addToInfoIndex() did not index the tap-qualified form \"dakilloth/mead/mead\", the exact name brew search returns for this cask")
	}
	if got.Desc != pkg.Desc || got.Version != pkg.Version {
		t.Errorf("addToInfoIndex()[tap-qualified key] = %+v, want the same package data as the short-token lookup", got)
	}

	// The short form must still work too, for every default-tap result.
	if _, ok := index[searchKey("mead", true)]; !ok {
		t.Error("addToInfoIndex() did not also index the short token \"mead\"")
	}
}

func TestAddToInfoIndexDefaultTapHasNoQualifiedDuplicateNeeded(t *testing.T) {
	// A homebrew/cask result's search-result name is already the short
	// form, so it only ever needs the short-token key -- confirms the
	// tap-qualified key doesn't clobber or confuse the common case.
	pkg := BrewPackage{Name: "meld", IsCask: true, Tap: "homebrew/cask", Desc: "Visual diff and merge tool"}

	index := map[string]BrewPackage{}
	addToInfoIndex(index, []BrewPackage{pkg})

	got, ok := index[searchKey("meld", true)]
	if !ok || got.Desc != pkg.Desc {
		t.Errorf("addToInfoIndex() short-token lookup for a default-tap cask = %+v, ok=%v, want the package data", got, ok)
	}
}
