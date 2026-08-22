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
