package main

import "testing"

func TestParseConfig(t *testing.T) {
	tests := []struct {
		name    string
		json    string
		want    Config
		wantErr bool
	}{
		{
			name: "valid explicit config",
			json: `{"intervalMinutes": 30, "greedy": true}`,
			want: Config{IntervalMinutes: 30, Greedy: true},
		},
		{
			name: "zero interval falls back to default",
			json: `{"intervalMinutes": 0}`,
			want: Config{IntervalMinutes: defaultIntervalMinutes, Greedy: false},
		},
		{
			name: "negative interval falls back to default",
			json: `{"intervalMinutes": -5}`,
			want: Config{IntervalMinutes: defaultIntervalMinutes, Greedy: false},
		},
		{
			name: "interval below minimum falls back to default",
			json: `{"intervalMinutes": 1}`,
			want: Config{IntervalMinutes: defaultIntervalMinutes, Greedy: false},
		},
		{
			name: "empty object uses all defaults",
			json: `{}`,
			want: Config{IntervalMinutes: defaultIntervalMinutes, Greedy: false},
		},
		{
			name:    "invalid json errors",
			json:    `not json`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseConfig([]byte(tt.json))
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseConfig() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if got != tt.want {
				t.Errorf("parseConfig() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	got := DefaultConfig()
	if got.IntervalMinutes != defaultIntervalMinutes {
		t.Errorf("DefaultConfig().IntervalMinutes = %d, want %d", got.IntervalMinutes, defaultIntervalMinutes)
	}
	if got.Greedy {
		t.Errorf("DefaultConfig().Greedy = true, want false")
	}
}

func TestConfigNormalizeIdempotent(t *testing.T) {
	c := Config{IntervalMinutes: 120, Greedy: true}
	got := c.normalize()
	if got != c {
		t.Errorf("normalize() changed an already-valid config: got %+v, want %+v", got, c)
	}
}
