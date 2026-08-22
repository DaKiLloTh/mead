package brew

import "testing"

func TestTopNBySize(t *testing.T) {
	tests := []struct {
		name  string
		sizes []PackageSize
		n     int
		want  []string // expected Name order
	}{
		{
			name: "sorts largest first",
			sizes: []PackageSize{
				{Name: "small", SizeBytes: 10},
				{Name: "big", SizeBytes: 1000},
				{Name: "medium", SizeBytes: 100},
			},
			n:    10,
			want: []string{"big", "medium", "small"},
		},
		{
			name: "caps at n",
			sizes: []PackageSize{
				{Name: "a", SizeBytes: 5},
				{Name: "b", SizeBytes: 4},
				{Name: "c", SizeBytes: 3},
				{Name: "d", SizeBytes: 2},
			},
			n:    2,
			want: []string{"a", "b"},
		},
		{
			name: "n <= 0 falls back to default limit",
			sizes: []PackageSize{
				{Name: "a", SizeBytes: 1},
			},
			n:    0,
			want: []string{"a"},
		},
		{
			name: "negative n falls back to default limit",
			sizes: []PackageSize{
				{Name: "a", SizeBytes: 1},
			},
			n:    -5,
			want: []string{"a"},
		},
		{
			name:  "empty input",
			sizes: []PackageSize{},
			n:     10,
			want:  []string{},
		},
		{
			name: "n larger than input returns everything",
			sizes: []PackageSize{
				{Name: "only", SizeBytes: 42},
			},
			n:    100,
			want: []string{"only"},
		},
		{
			name: "does not mutate input slice order",
			sizes: []PackageSize{
				{Name: "z", SizeBytes: 1},
				{Name: "y", SizeBytes: 999},
			},
			n:    10,
			want: []string{"y", "z"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			original := make([]PackageSize, len(tt.sizes))
			copy(original, tt.sizes)

			got := topNBySize(tt.sizes, tt.n)

			if len(got) != len(tt.want) {
				t.Fatalf("got %d entries, want %d: %+v", len(got), len(tt.want), got)
			}
			for i, name := range tt.want {
				if got[i].Name != name {
					t.Errorf("entry %d = %q, want %q (full result: %+v)", i, got[i].Name, name, got)
				}
			}

			// The input slice's own order must be untouched.
			for i := range original {
				if tt.sizes[i].Name != original[i].Name {
					t.Errorf("input slice was mutated: index %d now %q, was %q", i, tt.sizes[i].Name, original[i].Name)
				}
			}
		})
	}
}

func TestTopNBySize_CapAtDefaultLimit(t *testing.T) {
	sizes := make([]PackageSize, 0, 30)
	for i := 0; i < 30; i++ {
		sizes = append(sizes, PackageSize{Name: "pkg", SizeBytes: int64(i)})
	}

	got := topNBySize(sizes, 0)
	if len(got) != defaultLargestInstalledLimit {
		t.Fatalf("got %d entries, want %d (default limit)", len(got), defaultLargestInstalledLimit)
	}
	// Largest sizes (29 down to 10) should be the ones kept.
	if got[0].SizeBytes != 29 {
		t.Errorf("got[0].SizeBytes = %d, want 29", got[0].SizeBytes)
	}
	if got[len(got)-1].SizeBytes != int64(30-defaultLargestInstalledLimit) {
		t.Errorf("got[last].SizeBytes = %d, want %d", got[len(got)-1].SizeBytes, 30-defaultLargestInstalledLimit)
	}
}
