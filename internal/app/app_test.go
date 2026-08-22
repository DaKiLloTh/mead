package app

import "testing"

// TestGistURLRegexExcludesTrailingPunctuation guards against gistURLRe's
// old greedy \S+ path segment, which would sweep up trailing punctuation
// from surrounding prose (e.g. a sentence-ending period) into the captured
// URL, producing a broken link when the frontend renders it as an <a href>.
func TestGistURLRegexExcludesTrailingPunctuation(t *testing.T) {
	const url = "https://gist.github.com/some-user/abc123def456"

	cases := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "url alone",
			input: url,
			want:  url,
		},
		{
			name:  "url followed by period",
			input: url + ".",
			want:  url,
		},
		{
			name:  "url followed by other punctuation",
			input: "See the gist: " + url + "!",
			want:  url,
		},
		{
			name:  "url mid-sentence with trailing comma",
			input: "uploaded to " + url + ", check it out",
			want:  url,
		},
		{
			name:  "url wrapped in quotes",
			input: `"` + url + `"`,
			want:  url,
		},
		{
			name:  "url followed by closing paren",
			input: "(" + url + ")",
			want:  url,
		},
		{
			name:  "url with no surrounding punctuation context",
			input: "Log uploaded successfully\n" + url + "\nDone.",
			want:  url,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := gistURLRe.FindString(tc.input)
			if got != tc.want {
				t.Errorf("gistURLRe.FindString(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}
