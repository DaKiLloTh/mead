package main

import (
	"testing"

	"mead/internal/brew"
)

func TestTooltipText(t *testing.T) {
	tests := []struct {
		count int
		want  string
	}{
		{0, "mead-mon: up to date"},
		{1, "mead-mon: 1 update available"},
		{2, "mead-mon: 2 updates available"},
		{42, "mead-mon: 42 updates available"},
	}
	for _, tt := range tests {
		if got := tooltipText(tt.count); got != tt.want {
			t.Errorf("tooltipText(%d) = %q, want %q", tt.count, got, tt.want)
		}
	}
}

func TestMenuLine(t *testing.T) {
	tests := []struct {
		name string
		pkg  brew.OutdatedPackage
		want string
	}{
		{
			name: "normal package",
			pkg:  brew.OutdatedPackage{Name: "git", InstalledVersions: []string{"2.40.0"}, CurrentVersion: "2.41.0"},
			want: "git (2.40.0 -> 2.41.0)",
		},
		{
			name: "multiple installed versions uses the last one",
			pkg:  brew.OutdatedPackage{Name: "node", InstalledVersions: []string{"18.0.0", "18.1.0"}, CurrentVersion: "20.0.0"},
			want: "node (18.1.0 -> 20.0.0)",
		},
		{
			name: "missing installed version",
			pkg:  brew.OutdatedPackage{Name: "curl", CurrentVersion: "8.0.0"},
			want: "curl (unknown -> 8.0.0)",
		},
		{
			name: "missing current version",
			pkg:  brew.OutdatedPackage{Name: "curl", InstalledVersions: []string{"7.0.0"}},
			want: "curl (7.0.0 -> unknown)",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := menuLine(tt.pkg); got != tt.want {
				t.Errorf("menuLine() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNotificationBody(t *testing.T) {
	tests := []struct {
		name  string
		names []string
		want  string
	}{
		{"none", nil, "No outdated packages."},
		{"one", []string{"git"}, "git"},
		{"a few", []string{"git", "zsh", "curl"}, "git, zsh, curl"},
		{
			"exactly at the limit",
			[]string{"a", "b", "c", "d", "e"},
			"a, b, c, d, e",
		},
		{
			"over the limit summarizes the rest",
			[]string{"a", "b", "c", "d", "e", "f", "g"},
			"a, b, c, d, e, and 2 more",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := notificationBody(tt.names); got != tt.want {
				t.Errorf("notificationBody(%v) = %q, want %q", tt.names, got, tt.want)
			}
		})
	}
}
