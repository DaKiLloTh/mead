package brew

import "testing"

func TestLevenshtein(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		want int
	}{
		{"identical", "chrome", "chrome", 0},
		{"one substitution", "cat", "cot", 1},
		{"one insertion", "bambustudio", "bambu-studio", 1},
		{"one deletion", "bambu-studio", "bambustudio", 1},
		{"empty a", "", "abc", 3},
		{"empty b", "abc", "", 3},
		{"both empty", "", "", 0},
		{"totally different", "abc", "xyz", 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := levenshtein(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("levenshtein(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestStringSimilarity(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		want float64
	}{
		{"identical", "iterm2", "iterm2", 1},
		{"case insensitive identical", "BambuStudio", "bambustudio", 1},
		{"one char off in longer string", "docker-desktop", "dockr-desktop", 13.0 / 14.0},
		{"empty vs empty", "", "", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stringSimilarity(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("stringSimilarity(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestBestFuzzyToken(t *testing.T) {
	tokens := map[string]bool{
		"docker-desktop":     true,
		"visual-studio-code": true,
		"iterm2":             true,
	}

	t.Run("picks the closest token", func(t *testing.T) {
		token, score := bestFuzzyToken("dockr-desktop", tokens)
		if token != "docker-desktop" {
			t.Errorf("bestFuzzyToken = %q, want docker-desktop", token)
		}
		if score <= 0.5 {
			t.Errorf("score = %v, want a reasonably high similarity score", score)
		}
	})

	t.Run("empty slug matches nothing", func(t *testing.T) {
		token, score := bestFuzzyToken("", tokens)
		if token != "" || score != 0 {
			t.Errorf("bestFuzzyToken(\"\") = (%q, %v), want (\"\", 0)", token, score)
		}
	})

	t.Run("deterministic tie break", func(t *testing.T) {
		tied := map[string]bool{"bbb": true, "aaa": true}
		token, _ := bestFuzzyToken("zzz", tied)
		if token != "aaa" {
			t.Errorf("bestFuzzyToken tie break = %q, want aaa (lexicographically smallest)", token)
		}
	})
}
