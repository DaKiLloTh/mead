package main

import (
	"errors"
	"reflect"
	"testing"
)

func TestMenuView(t *testing.T) {
	tests := []struct {
		name string
		st   status
		want view
	}{
		{
			name: "before the first check",
			st:   status{},
			want: view{header: "Not checked yet", updateAllTitle: "Update all"},
		},
		{
			name: "first check running",
			st:   status{checking: true},
			want: view{header: "Checking for updates…", updateAllTitle: "Update all"},
		},
		{
			name: "first check failed",
			st:   status{checkFailed: true},
			want: view{header: "Couldn't check for updates", updateAllTitle: "Update all"},
		},
		{
			name: "up to date",
			st:   status{checked: true},
			want: view{header: "Up to date", updateAllTitle: "Update all"},
		},
		{
			name: "one update",
			st:   status{checked: true, count: 1},
			want: view{alert: true, badge: "1", header: "1 update available", updateAllTitle: "Update all", updateAllEnabled: true},
		},
		{
			name: "several updates",
			st:   status{checked: true, count: 12},
			want: view{alert: true, badge: "12", header: "12 updates available", updateAllTitle: "Update all", updateAllEnabled: true},
		},
		{
			name: "rechecking keeps the last count but disables Update all",
			st:   status{checked: true, count: 3, checking: true},
			want: view{alert: true, badge: "3", header: "3 updates available", updateAllTitle: "Update all"},
		},
		{
			name: "a failed recheck keeps the last count and says so",
			st:   status{checked: true, count: 3, checkFailed: true},
			want: view{alert: true, badge: "3", header: "3 updates available (last check failed)", updateAllTitle: "Update all", updateAllEnabled: true},
		},
		{
			name: "updating",
			st:   status{checked: true, count: 3, upgrading: true},
			want: view{alert: true, badge: "3", header: "Updating…", updateAllTitle: "Updating…"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := menuView(tt.st); got != tt.want {
				t.Errorf("menuView(%+v) = %+v, want %+v", tt.st, got, tt.want)
			}
		})
	}
}

func TestUpgradeArgs(t *testing.T) {
	if got := upgradeArgs(false); !reflect.DeepEqual(got, []string{"upgrade"}) {
		t.Errorf("upgradeArgs(false) = %v", got)
	}
	if got := upgradeArgs(true); !reflect.DeepEqual(got, []string{"upgrade", "--greedy"}) {
		t.Errorf("upgradeArgs(true) = %v", got)
	}
}

func TestOpenMeadArgs(t *testing.T) {
	if got := openMeadArgs(); !reflect.DeepEqual(got, []string{"-a", "mead"}) {
		t.Errorf("openMeadArgs() = %v", got)
	}
}

func TestUpgradeResultText(t *testing.T) {
	if got := upgradeResultText(nil); got != "All packages are up to date." {
		t.Errorf("success = %q", got)
	}
	if got := upgradeResultText(errors.New("cask needs sudo")); got != "Update all failed: cask needs sudo" {
		t.Errorf("failure = %q", got)
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
