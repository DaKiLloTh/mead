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

func TestSearchMatchConfidence(t *testing.T) {
	tests := []struct {
		name  string
		input string
		query string
		want  string
	}{
		{"exact match is exact confidence", "blender", "blender", "exact"},
		{"prefix match is exact confidence", "blender-benchmark", "blender", "exact"},
		{"substring match is exact confidence", "the-blender-app", "blender", "exact"},
		{"fuzzy leftover is possible confidence", "bender", "blender", "possible"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := searchMatchConfidence(tt.input, tt.query); got != tt.want {
				t.Errorf("searchMatchConfidence(%q, %q) = %q, want %q", tt.input, tt.query, got, tt.want)
			}
		})
	}
}
