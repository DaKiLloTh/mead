package app

import (
	"bytes"
	"encoding/base64"
	"testing"
)

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

// TestDecodeDataURLPNG covers decodeDataURLPNG, used by
// ExportDependencyGraphPNG to turn what the frontend graph library's
// cy.png()/canvas.toDataURL() produces into raw bytes before writing them
// to the path the user chose in the native save dialog.
func TestDecodeDataURLPNG(t *testing.T) {
	raw := []byte("not really a png, just some bytes\x00\x01\x02")
	b64 := base64.StdEncoding.EncodeToString(raw)

	cases := []struct {
		name    string
		input   string
		want    []byte
		wantErr bool
	}{
		{
			name:  "real data URL prefix is stripped",
			input: "data:image/png;base64," + b64,
			want:  raw,
		},
		{
			name:  "bare base64 with no data URL prefix",
			input: b64,
			want:  raw,
		},
		{
			name:    "malformed base64 is rejected",
			input:   "data:image/png;base64,not-valid-base64!!!",
			wantErr: true,
		},
		{
			name:    "empty string is rejected",
			input:   "",
			want:    []byte{},
			wantErr: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := decodeDataURLPNG(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("decodeDataURLPNG(%q): expected an error, got none", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("decodeDataURLPNG(%q): unexpected error: %v", tc.input, err)
			}
			if !bytes.Equal(got, tc.want) {
				t.Errorf("decodeDataURLPNG(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}
