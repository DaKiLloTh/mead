package system

import "testing"

func TestNormalizeLocale(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"simple language_region", "en_US", "en-US"},
		{"different region", "fr_FR", "fr-FR"},
		{"trims surrounding whitespace and newline", "  ja_JP\n", "ja-JP"},
		{"drops an @ variant suffix", "en_US@currency=USD", "en-US"},
		{"drops an @ suffix with no trailing space", "de_DE@collation=phonebook", "de-DE"},
		{"language only, no region", "en", "en"},
		{"multi-segment script+region tag", "zh_Hans_CN", "zh-Hans-CN"},
		{"empty input", "", ""},
		{"whitespace-only input", "   ", ""},
		{"only an @ suffix leaves nothing", "@calendar=chinese", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := normalizeLocale(c.in)
			if got != c.want {
				t.Errorf("normalizeLocale(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
