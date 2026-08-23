package brew

import "testing"

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		want int
	}{
		{"exactly equal", "3.6.11", "3.6.11", 0},
		{"a newer patch", "1.6.6", "1.6.5", 1},
		{"a older patch", "1.6.5", "1.6.6", -1},
		{"a older, missing minor segment", "154.0", "154.0.1", -1},
		{"double digit minor beats single digit lexicographically wrong way", "1.10.0", "1.9.0", 1},
		{"comma separated build metadata, a newer", "4.3.9,147,1742287964", "4.3.9,146,1742287964", 1},
		{"leading zero segments compare numerically equal", "02.08.02.61,20260820225108", "2.8.2.61,20260820225108", 0},
		{"trailing zero segment is equal", "1.2", "1.2.0", 0},
		{"trailing nonzero segment is newer", "1.2.1", "1.2", 1},
		{"trailing nonzero segment, other direction", "1.2", "1.2.1", -1},
		{"case insensitive equal strings", "Latest", "latest", 0},
		{"non-numeric fallback string compare", "1.0", "latest", -1},
		{"totally unparseable falls back to string compare", "n/a", "n/a", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CompareVersions(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("CompareVersions(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestPossibleDowngrade(t *testing.T) {
	tests := []struct {
		name              string
		installed, cask   string
		wantDowngradeRisk bool
	}{
		{"installed newer than cask", "1.6.6", "1.6.5", true},
		{"installed older than cask", "1.6.4", "1.6.5", false},
		{"installed equals cask", "1.6.5", "1.6.5", false},
		{"installed version unknown", "", "1.6.5", false},
		{"cask version unknown", "1.6.5", "", false},
		{"both unknown", "", "", false},
		{"real bambu-studio-shaped versions, installed newer", "02.08.03.00,20260901000000", "02.08.02.61,20260820225108", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PossibleDowngrade(tt.installed, tt.cask)
			if got != tt.wantDowngradeRisk {
				t.Errorf("PossibleDowngrade(%q, %q) = %v, want %v", tt.installed, tt.cask, got, tt.wantDowngradeRisk)
			}
		})
	}
}
