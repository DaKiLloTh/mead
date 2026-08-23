package main

import (
	"reflect"
	"testing"

	"mead/internal/brew"
)

func TestOutdatedNames(t *testing.T) {
	pkgs := []brew.OutdatedPackage{
		{Name: "zsh"},
		{Name: "git"},
		{Name: "curl"},
	}
	got := outdatedNames(pkgs)
	want := []string{"curl", "git", "zsh"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("outdatedNames() = %v, want %v", got, want)
	}
}

func TestOutdatedNamesEmpty(t *testing.T) {
	got := outdatedNames(nil)
	if len(got) != 0 {
		t.Errorf("outdatedNames(nil) = %v, want empty", got)
	}
}

func TestShouldNotify(t *testing.T) {
	tests := []struct {
		name     string
		previous []string
		current  []string
		want     bool
	}{
		{"both empty", nil, nil, false},
		{"unchanged non-empty set", []string{"git", "zsh"}, []string{"git", "zsh"}, false},
		{"new package added", []string{"git"}, []string{"git", "zsh"}, true},
		{"package removed", []string{"git", "zsh"}, []string{"git"}, true},
		{"first check finds outdated packages", nil, []string{"git"}, true},
		{"everything got updated", []string{"git"}, nil, true},
		{"same count different names", []string{"git"}, []string{"zsh"}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldNotify(tt.previous, tt.current); got != tt.want {
				t.Errorf("shouldNotify(%v, %v) = %v, want %v", tt.previous, tt.current, got, tt.want)
			}
		})
	}
}
